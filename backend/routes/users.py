"""
Rotas de perfil de usuário — avatar via MongoDB GridFS.
"""
import io
import re
import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from firebase_admin import auth as firebase_auth, firestore
from bson import ObjectId
from services.public_files import stream_public_gridfs_file
from services.security_audit import audit_event, hash_identifier
from services.email_service import build_welcome_email, send_transactional_email
from services.upload_validation import IMAGE_CONTENT_TYPES, safe_filename, validate_upload
from pydantic import BaseModel, EmailStr, Field

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer(auto_error=False)

_db = None
TRIAL_DAYS = 15
TRANSPARENT_GIF = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00"
    b"\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,"
    b"\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02"
    b"D\x01\x00;"
)

# ============================================
# VALIDAÇÃO DE CPF
# ============================================

def _remover_caracteres_cpf(cpf: str) -> str:
    """Remove todos os caracteres não numéricos do CPF"""
    return re.sub(r'[^\d]', '', cpf)

def _validar_formato_cpf(cpf: str) -> tuple[bool, str]:
    """
    Valida o formato do CPF brasileiro.

    Retorna:
    - (True, mensagem de sucesso)
    - (False, mensagem de erro)

    Formato esperado:
    - 11 dígitos numéricos (sem pontos, sem traço, sem máscara)
    """
    cpf_limpo = _remover_caracteres_cpf(cpf)

    if not cpf_limpo:
        return False, "CPF não pode ser vazio"

    if len(cpf_limpo) != 11:
        return False, "CPF deve ter exatamente 11 dígitos numéricos"

    if not cpf_limpo.isdigit():
        return False, "CPF deve conter apenas números (sem pontos, traços ou máscaras)"

    return True, "CPF válido"

def _calcular_digitos_verificadores(cpf: str) -> tuple[int, int]:
    """
    Calcula os dois dígitos verificadores do CPF pelo algoritmo oficial.
    """
    cpf = _remover_caracteres_cpf(cpf)
    if len(cpf) != 11:
        return 0, 0

    def calcular(base: str, pesos: range) -> int:
        soma = sum(int(digito) * peso for digito, peso in zip(base, pesos))
        resto = soma % 11
        return 0 if resto < 2 else 11 - resto

    primeiro_digito = calcular(cpf[:9], range(10, 1, -1))
    segundo_digito = calcular(cpf[:10], range(11, 1, -1))
    return primeiro_digito, segundo_digito


def _verificar_duplicidade_cpf(cpf: str, db, current_uid: str | None = None) -> tuple[bool, str]:
    """
    Verifica se o CPF já está cadastrado.

    Retorna:
    - (True, mensagem de erro se duplicado)
    - (False, mensagem de sucesso se disponível)
    """
    cpf_limpo = _remover_caracteres_cpf(cpf)

    if len(cpf_limpo) != 11:
        return False, "CPF inválido"

    try:
        usuarios_query = db.collection("users").where("cpf", "==", cpf_limpo).limit(1)
        usuarios = list(usuarios_query.stream())
        if current_uid:
            usuarios = [doc for doc in usuarios if getattr(doc, "id", None) != current_uid]

        if usuarios:
            logger.warning(
                "[SECURITY] cpf_duplicate_registration_attempt cpf_hash=%s",
                hash_identifier(cpf_limpo),
            )
            return True, "CPF já cadastrado. Faça login ou entre em contato com o suporte."
    except Exception:
        logger.warning("[SECURITY] Erro ao verificar duplicidade de CPF")
        return True, "Erro ao verificar duplicidade. Por favor, tente novamente."

    return False, "CPF disponível"


def _trial_end(now: datetime | None = None) -> datetime:
    base = now or datetime.now(timezone.utc)
    return base + timedelta(days=TRIAL_DAYS)


def _validar_dados_pagador(nome: str, cpf: str, telefone: str) -> dict:
    nome_limpo = str(nome or "").strip()
    cpf_limpo = _remover_caracteres_cpf(cpf)
    telefone_limpo = re.sub(r'\D', '', str(telefone or ""))

    if not nome_limpo:
        raise HTTPException(400, "Nome completo é obrigatório")
    if len(nome_limpo) > 120:
        raise HTTPException(400, "Nome completo é muito longo")

    cpf_valido, msg_cpf = _validar_formato_cpf(cpf_limpo)
    if not cpf_valido:
        raise HTTPException(400, f"CPF inválido: {msg_cpf}")
    if cpf_limpo == cpf_limpo[0] * 11:
        raise HTTPException(400, "CPF inválido")

    dv1_esperado, dv2_esperado = _calcular_digitos_verificadores(cpf_limpo)
    if (dv1_esperado, dv2_esperado) != (int(cpf_limpo[9]), int(cpf_limpo[10])):
        raise HTTPException(400, "Dígitos verificadores do CPF incorretos")

    if len(telefone_limpo) < 10 or len(telefone_limpo) > 11:
        raise HTTPException(400, "Telefone inválido. Inclua o DDD (mínimo 10 dígitos, máximo 11)")

    return {"nome": nome_limpo, "cpf": cpf_limpo, "telefone": telefone_limpo}


def _trial_subscription_data(uid: str, now: datetime | None = None) -> dict:
    return {
        "userId": uid,
        "planId": "trial",
        "status": "trialing",
        "trialEndsAt": _trial_end(now),
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
        "paymentMethod": None,
    }


def _create_user_and_trial(uid: str, user_data: dict, db) -> None:
    batch = db.batch()
    batch.set(db.collection("users").document(uid), user_data)
    batch.set(db.collection("subscriptions").document(uid), _trial_subscription_data(uid))
    batch.commit()

def init_users(database):
    global _db
    _db = database


def _gridfs():
    return AsyncIOMotorGridFSBucket(_db, bucket_name="user_avatars")


async def get_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    if not credentials:
        logger.warning("[SECURITY] auth_missing route=users")
        raise HTTPException(401, "Token obrigatório")
    try:
        decoded = await asyncio.to_thread(firebase_auth.verify_id_token, credentials.credentials)
        return decoded['uid']
    except Exception:
        logger.warning("[SECURITY] auth_invalid route=users")
        raise HTTPException(401, "Token inválido")


async def _verify_user_token(token: str) -> str:
    if not token:
        logger.warning("[SECURITY] auth_missing route=users_token")
        raise HTTPException(401, "Token obrigatório")
    try:
        decoded = await asyncio.to_thread(firebase_auth.verify_id_token, token)
        return decoded["uid"]
    except Exception:
        logger.warning("[SECURITY] auth_invalid route=users_token")
        raise HTTPException(401, "Token inválido")


def _fs():
    return firestore.client()


async def _soft_delete_vitrine_for_user(offer_id: str, uid: str, request: Request | None = None) -> dict:
    try:
        offer_oid = ObjectId(offer_id)
    except Exception:
        raise HTTPException(400, "ID inválido")

    result = await _db.vitrine_offers.update_one(
        {"_id": offer_oid, "created_by": uid},
        {"$set": {"status": "deleted", "updated_at": datetime.now(timezone.utc)}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Oferta não encontrada")

    await audit_event(
        "vitrine_offer_deleted",
        uid=uid,
        status="success",
        metadata={"offerId": offer_id, "route": "users_fallback"},
        request=request,
    )
    return {"ok": True, "route": "users_fallback"}


@router.get("/avatars/{grid_id}")
async def servir_avatar(grid_id: str):
    """Serve avatar público via GridFS."""
    return await stream_public_gridfs_file(_gridfs(), grid_id, label="Avatar")


@router.post("/avatar")
async def upload_avatar(
    arquivo: UploadFile = File(...),
    uid: str = Depends(get_user_id)
):
    """Recebe a foto do perfil, salva no GridFS e atualiza o perfil do usuário."""
    content = await arquivo.read()
    filename = validate_upload(
        arquivo,
        content,
        label="foto de perfil",
        allowed_extensions={".jpg", ".jpeg", ".png", ".webp"},
        allowed_kinds={"jpg", "png", "webp"},
        allowed_content_types=IMAGE_CONTENT_TYPES,
        max_bytes=2 * 1024 * 1024,
    )

    try:
        grid_id = await _gridfs().upload_from_stream(
            filename,
            io.BytesIO(content),
            metadata={
                "user_id": uid,
                "content_type": arquivo.content_type or "image/jpeg",
                "original_filename": safe_filename(arquivo.filename, filename),
            },
        )
    except Exception:
        logger.exception("[USERS] Erro ao salvar avatar no GridFS")
        raise HTTPException(500, "Erro ao salvar foto de perfil")

    backend_url = os.environ.get("BACKEND_URL", "https://api.venpro.com.br").rstrip("/")
    photo_url = f"{backend_url}/api/users/avatars/{str(grid_id)}"

    try:
        await asyncio.to_thread(
            _fs().collection("users").document(uid).set,
            {
                "photoURL": photo_url,
                "updated_at": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
    except Exception:
        logger.exception("[USERS] Erro ao atualizar photoURL do usuário")
        raise HTTPException(500, "Foto salva, mas não foi possível atualizar o perfil")

    return {"photoURL": photo_url, "gridId": str(grid_id)}


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    nome: str | None = None
    name: str | None = None
    cpf: str
    telefone: str


class BillingProfileRequest(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    nome: str | None = Field(default=None, max_length=120)
    cpf: str
    telefone: str


class DeviceSessionPayload(BaseModel):
    deviceId: str = Field(..., min_length=16, max_length=160)
    platform: str | None = Field(default=None, max_length=80)
    language: str | None = Field(default=None, max_length=40)
    timezone: str | None = Field(default=None, max_length=80)
    screenWidth: int | None = Field(default=None, ge=0, le=20000)
    screenHeight: int | None = Field(default=None, ge=0, le=20000)
    appVersion: str | None = Field(default=None, max_length=40)


class DeleteVitrinePayload(BaseModel):
    offer_id: str = Field(..., min_length=12, max_length=40)


@router.post("/welcome-email")
async def send_welcome_email(
    request: Request,
    uid: str = Depends(get_user_id),
):
    """Envia email de boas-vindas sem bloquear o cadastro."""
    user_ref = _fs().collection("users").document(uid)
    user_doc = await asyncio.to_thread(user_ref.get)
    if not user_doc.exists:
        raise HTTPException(404, "Usuário não encontrado")

    user_data = user_doc.to_dict() or {}
    if user_data.get("welcomeEmailSentAt"):
        return {"sent": False, "reason": "already_sent"}

    email = (user_data.get("email") or "").strip()
    name = (user_data.get("name") or user_data.get("nome") or "").strip()
    if not email:
        return {"sent": False, "reason": "missing_email"}

    subject, text_content, html_content = build_welcome_email(name)
    result = await asyncio.to_thread(
        send_transactional_email,
        to_email=email,
        subject=subject,
        text_content=text_content,
        html_content=html_content,
    )

    if result.get("sent"):
        await asyncio.to_thread(
            user_ref.set,
            {
                "welcomeEmailSentAt": firestore.SERVER_TIMESTAMP,
                "updated_at": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        await audit_event("welcome_email_sent", uid=uid, status="success", request=request)
    else:
        await audit_event(
            "welcome_email_skipped",
            uid=uid,
            status="ignored",
            metadata={"reason": result.get("reason")},
            request=request,
        )

    return result


@router.post("/device-session")
async def register_device_session(
    payload: DeviceSessionPayload,
    request: Request,
    uid: str = Depends(get_user_id),
):
    """Registra uso de dispositivo sem bloquear acesso."""
    device_hash = hash_identifier(payload.deviceId)
    if not device_hash:
        raise HTTPException(400, "Dispositivo inválido")

    device_ref = _fs().collection("users").document(uid).collection("devices").document(device_hash)

    def _write():
        doc = device_ref.get()
        new_device = not doc.exists
        data = {
            "deviceHash": device_hash,
            "platform": payload.platform,
            "language": payload.language,
            "timezone": payload.timezone,
            "screenWidth": payload.screenWidth,
            "screenHeight": payload.screenHeight,
            "appVersion": payload.appVersion,
            "userAgent": (request.headers.get("user-agent") or "")[:180],
            "lastSeenAt": firestore.SERVER_TIMESTAMP,
            "loginCount": firestore.Increment(1),
        }
        if new_device:
            data["firstSeenAt"] = firestore.SERVER_TIMESTAMP
        device_ref.set(data, merge=True)
        return new_device

    new_device = await asyncio.to_thread(_write)
    await audit_event(
        "device_session_registered",
        uid=uid,
        status="success",
        metadata={"deviceHash": device_hash, "newDevice": new_device},
        request=request,
    )
    return {"ok": True, "deviceHash": device_hash, "newDevice": new_device}


@router.post("/vitrine-delete")
async def delete_vitrine_from_user_route(
    payload: DeleteVitrinePayload,
    request: Request,
    uid: str = Depends(get_user_id),
):
    """Fallback autenticado para exclusão de vitrine via rota /users."""
    return await _soft_delete_vitrine_for_user(payload.offer_id, uid, request=request)


@router.get("/vitrine-delete-link")
async def delete_vitrine_from_user_link(request: Request, offer_id: str = "", token: str = ""):
    """Fallback por imagem, autenticado por token Firebase, para redes que bloqueiam XHR."""
    uid = await _verify_user_token(token)
    await _soft_delete_vitrine_for_user(offer_id, uid, request=request)
    return Response(
        content=TRANSPARENT_GIF,
        media_type="image/gif",
        headers={"Cache-Control": "no-store, max-age=0"},
    )


@router.post("/ensure-trial")
async def ensure_trial_subscription(
    uid: str = Depends(get_user_id),
):
    """Garante trial server-side para usuários legítimos já cadastrados."""
    db = _fs()
    user_ref = db.collection("users").document(uid)
    sub_ref = db.collection("subscriptions").document(uid)

    def _ensure():
        user_doc = user_ref.get()
        if not user_doc.exists:
            return None
        sub_doc = sub_ref.get()
        if sub_doc.exists:
            return sub_doc.to_dict()
        data = _trial_subscription_data(uid)
        sub_ref.set(data)
        return data

    data = await asyncio.to_thread(_ensure)
    if data is None:
        raise HTTPException(404, "Usuário não encontrado")
    return {
        "ok": True,
        "subscription": {
            **data,
            "trialEndsAt": data.get("trialEndsAt").isoformat() if hasattr(data.get("trialEndsAt"), "isoformat") else data.get("trialEndsAt"),
        },
    }


@router.post("/billing-profile")
async def update_billing_profile(
    payload: BillingProfileRequest,
    uid: str = Depends(get_user_id),
):
    """Atualiza CPF/telefone pelo backend, com validação e proteção contra duplicidade."""
    dados = _validar_dados_pagador(payload.name or payload.nome or "", payload.cpf, payload.telefone)
    cpf_duplicado, msg_duplicidade = await asyncio.to_thread(
        _verificar_duplicidade_cpf,
        dados["cpf"],
        _fs(),
        uid,
    )
    if cpf_duplicado:
        raise HTTPException(400, msg_duplicidade)

    await asyncio.to_thread(
        _fs().collection("users").document(uid).set,
        {
            "name": dados["nome"],
            "nome": dados["nome"],
            "cpf": dados["cpf"],
            "telefone": dados["telefone"],
            "updated_at": firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )
    await audit_event("billing_profile_updated", uid=uid, status="success")
    return {"ok": True}


@router.post("/register")
async def register(
    payload: RegisterRequest,
):
    """
    Registra novo usuário no sistema.

    Validações:
    - Email (básico)
    - Senha (básica)
    - CPF (formato e validação completa)
    - Telefone (básica)
    - Token Firebase obrigatório
    """
    email = str(payload.email).strip().lower()
    password = payload.password
    nome = (payload.nome or payload.name or "").strip()

    logger.info("[REGISTER] Novo registro solicitado: email_hash=%s", hash_identifier(email))

    # 1. Validação básica de campos
    if not email or not password or not nome or not payload.cpf or not payload.telefone:
        raise HTTPException(400, "Todos os campos são obrigatórios")

    if not email or '@' not in email or '.' not in email:
        raise HTTPException(400, "Email inválido")

    if len(password) < 6:
        raise HTTPException(400, "A senha deve ter no mínimo 6 caracteres")

    dados_pagador = _validar_dados_pagador(nome, payload.cpf, payload.telefone)
    cpf = dados_pagador["cpf"]
    telefone_clean = dados_pagador["telefone"]

    # 3. Verificação de duplicidade de CPF
    cpf_duplicado, msg_duplicidade = await asyncio.to_thread(_verificar_duplicidade_cpf, cpf, _fs())
    if cpf_duplicado:
        raise HTTPException(400, msg_duplicidade)

    # 5. Cria usuário no Firebase Auth
    try:
        user = await asyncio.to_thread(
            firebase_auth.create_user,
            email=email,
            password=password,
            display_name=nome,
        )
        uid = user.uid
        logger.info("[REGISTER] Firebase user criado: uid=%s", uid)
    except Exception as e:
        logger.error("[REGISTER] Erro ao criar Firebase user: %s", e.__class__.__name__)
        error_text = str(e)
        if "EMAIL_EXISTS" in error_text or "already exists" in error_text.lower():
            raise HTTPException(400, "Este email já está cadastrado")
        elif "WEAK_PASSWORD" in error_text:
            raise HTTPException(400, "A senha é muito fraca. Use no mínimo 6 caracteres")
        raise HTTPException(400, "Erro ao criar usuário")

    # 6. Salva dados adicionais no Firestore (incluindo CPF validado)
    user_data = {
        "email": email,
        "name": dados_pagador["nome"],
        "nome": dados_pagador["nome"],
        "cpf": cpf,
        "telefone": telefone_clean,
        "role": "user",
        "license_type": "trial",
        "trial_ends_at": firestore.SERVER_TIMESTAMP,
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }

    try:
        await asyncio.to_thread(_create_user_and_trial, uid, user_data, _fs())
        logger.info("[REGISTER] Dados e trial salvos no Firestore: uid=%s", uid)
    except Exception:
        logger.exception("[REGISTER] Erro ao salvar dados no Firestore: uid=%s", uid)
        # Desfaz o usuário Firebase para evitar estado inconsistente
        try:
            await asyncio.to_thread(firebase_auth.delete_user, uid)
        except Exception:
            logger.warning("[REGISTER] Não foi possível desfazer Firebase user: uid=%s", uid)
        raise HTTPException(500, "Erro ao salvar dados do usuário. Tente novamente.")

    return {
        "uid": uid,
        "email": email,
        "nome": nome,
        "message": "Usuário registrado com sucesso"
    }
