"""
Rotas de perfil de usuário — avatar via MongoDB GridFS.
"""
import io
import re
import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, parse_qsl, urlencode, urlparse, urlunparse
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from firebase_admin import auth as firebase_auth, firestore
from bson import ObjectId
from pymongo.errors import OperationFailure
from services.public_files import stream_public_gridfs_file
from services.security_audit import audit_event, hash_identifier
from services.email_service import build_welcome_email, send_transactional_email
from services.email_verification_access import ensure_email_verified_for_required_user
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
ALLOWED_REDIRECT_HOSTS = {"venpro.com.br", "www.venpro.com.br", "anota-ganha-app.web.app"}
PARTNER_CODES = {
    "carlos14off": {
        "name": "Carlos Vinicios",
        "commissionMonthly": 40,
        "discountPercent": 0,
    }
}

# ============================================
# VALIDAÇÃO DE DOCUMENTO FISCAL
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


def _calcular_digitos_verificadores_cnpj(cnpj: str) -> tuple[int, int]:
    cnpj = _remover_caracteres_cpf(cnpj)
    if len(cnpj) != 14:
        return 0, 0

    def calcular(base: str, pesos: list[int]) -> int:
        soma = sum(int(digito) * peso for digito, peso in zip(base, pesos))
        resto = soma % 11
        return 0 if resto < 2 else 11 - resto

    primeiro_digito = calcular(cnpj[:12], [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    segundo_digito = calcular(cnpj[:13], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    return primeiro_digito, segundo_digito


def _validar_documento_fiscal(documento: str) -> tuple[str, str]:
    doc_limpo = _remover_caracteres_cpf(documento)

    if len(doc_limpo) == 11:
        cpf_valido, msg_cpf = _validar_formato_cpf(doc_limpo)
        if not cpf_valido:
            raise HTTPException(400, f"CPF inválido: {msg_cpf}")
        if doc_limpo == doc_limpo[0] * 11:
            raise HTTPException(400, "CPF inválido")
        dv1_esperado, dv2_esperado = _calcular_digitos_verificadores(doc_limpo)
        if (dv1_esperado, dv2_esperado) != (int(doc_limpo[9]), int(doc_limpo[10])):
            raise HTTPException(400, "Dígitos verificadores do CPF incorretos")
        return "cpf", doc_limpo

    if len(doc_limpo) == 14:
        if doc_limpo == doc_limpo[0] * 14:
            raise HTTPException(400, "CNPJ inválido")
        dv1_esperado, dv2_esperado = _calcular_digitos_verificadores_cnpj(doc_limpo)
        if (dv1_esperado, dv2_esperado) != (int(doc_limpo[12]), int(doc_limpo[13])):
            raise HTTPException(400, "Dígitos verificadores do CNPJ incorretos")
        return "cnpj", doc_limpo

    raise HTTPException(400, "Informe CPF com 11 dígitos ou CNPJ com 14 dígitos")


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
    telefone_limpo = re.sub(r'\D', '', str(telefone or ""))

    if not nome_limpo:
        raise HTTPException(400, "Nome completo é obrigatório")
    if len(nome_limpo) > 120:
        raise HTTPException(400, "Nome completo é muito longo")

    documento_tipo, documento = _validar_documento_fiscal(cpf)

    if len(telefone_limpo) < 10 or len(telefone_limpo) > 11:
        raise HTTPException(400, "Telefone inválido. Inclua o DDD (mínimo 10 dígitos, máximo 11)")

    return {
        "nome": nome_limpo,
        "cpf": documento if documento_tipo == "cpf" else None,
        "cnpj": documento if documento_tipo == "cnpj" else None,
        "cpfCnpj": documento,
        "documentoTipo": documento_tipo,
        "telefone": telefone_limpo,
    }


def _normalize_referral_code(value: str | None) -> str:
    code = re.sub(r"[^a-z0-9_-]", "", str(value or "").strip().lower())
    return code[:40]


def _referral_user_data(code: str) -> dict:
    if not code:
        return {}
    data = {
        "referralCode": code,
        "referredByCode": code,
        "referralCapturedAt": firestore.SERVER_TIMESTAMP,
    }
    partner = PARTNER_CODES.get(code)
    if partner:
        data.update({
            "referredByPartnerName": partner["name"],
            "referredByPartnerCode": code,
            "referralDiscountPercent": partner["discountPercent"],
        })
    return data


def _normalize_person_name(value: str | None) -> str:
    text = str(value or "").strip().lower()
    replacements = {
        "á": "a", "à": "a", "â": "a", "ã": "a",
        "é": "e", "ê": "e",
        "í": "i",
        "ó": "o", "ô": "o", "õ": "o",
        "ú": "u",
        "ç": "c",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return re.sub(r"\s+", " ", text)


def _partner_profile_for_user_sync(uid: str, db) -> dict:
    user_ref = db.collection("users").document(uid)
    user_doc = user_ref.get()
    if not user_doc.exists:
        raise HTTPException(404, "Usuário não encontrado")

    user_data = user_doc.to_dict() or {}
    partner = user_data.get("partner") if isinstance(user_data.get("partner"), dict) else {}
    partner_code = _normalize_referral_code(
        partner.get("code")
        or user_data.get("partnerCode")
        or user_data.get("referralOwnerCode")
        or user_data.get("referralCodeOwner")
        or user_data.get("affiliateCode")
    )

    if (partner.get("enabled") or user_data.get("partnerEnabled")) and partner_code in PARTNER_CODES:
        config = PARTNER_CODES[partner_code]
        return {"code": partner_code, "name": config["name"], **config}

    name = _normalize_person_name(user_data.get("name") or user_data.get("nome") or user_data.get("displayName"))
    if "carlos" in name and ("vinicios" in name or "vinicius" in name):
        code = "carlos14off"
        config = PARTNER_CODES[code]
        user_ref.set(
            {
                "partner": {
                    "enabled": True,
                    "code": code,
                    "name": config["name"],
                    "commissionMonthly": config["commissionMonthly"],
                    "discountPercent": config["discountPercent"],
                },
                "partnerEnabled": True,
                "partnerCode": code,
                "updated_at": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        return {"code": code, "name": config["name"], **config}

    raise HTTPException(403, "Acesso restrito ao programa de parceiros")


def _subscription_status_label(subscription: dict) -> str:
    status = str(subscription.get("status") or "").lower()
    if status == "active":
        return "Assinando ativo"
    if status == "trialing":
        return "Teste gratis"
    if status == "pending":
        return "Pagamento pendente"
    if status == "canceling":
        return "Cancelamento agendado"
    if status == "canceled":
        return "Cancelado"
    if status == "trial_expired":
        return "Teste encerrado"
    return "Sem assinatura ativa"


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
        return await ensure_email_verified_for_required_user(decoded, route="users")
    except HTTPException:
        raise
    except Exception:
        logger.warning("[SECURITY] auth_invalid route=users")
        raise HTTPException(401, "Token inválido")


async def _verify_user_token(token: str) -> str:
    if not token:
        logger.warning("[SECURITY] auth_missing route=users_token")
        raise HTTPException(401, "Token obrigatório")
    try:
        decoded = await asyncio.to_thread(firebase_auth.verify_id_token, token)
        return await ensure_email_verified_for_required_user(decoded, route="users_token")
    except HTTPException:
        raise
    except Exception:
        logger.warning("[SECURITY] auth_invalid route=users_token")
        raise HTTPException(401, "Token inválido")


def _extract_simple_token(raw_body: bytes, query_token: str | None = None) -> str:
    if query_token:
        return query_token.strip()

    text = raw_body.decode("utf-8", errors="ignore").strip()
    if not text:
        return ""

    parsed = parse_qs(text, keep_blank_values=False)
    token_values = parsed.get("token") or parsed.get("idToken")
    if token_values:
        return token_values[0].strip()

    return text


def _safe_frontend_redirect(next_url: str | None = None) -> str:
    fallback = (os.environ.get("FRONTEND_URL") or "https://venpro.com.br").rstrip("/") + "/vitrine"
    if not next_url:
        return fallback

    if next_url.startswith("/"):
        return (os.environ.get("FRONTEND_URL") or "https://venpro.com.br").rstrip("/") + next_url

    parsed = urlparse(next_url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_REDIRECT_HOSTS:
        return fallback
    return next_url


def _append_query(url: str, params: dict[str, str]) -> str:
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.update(params)
    return urlunparse(parsed._replace(query=urlencode(query)))


def _is_storage_quota_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return (
        isinstance(exc, OperationFailure)
        and (
            getattr(exc, "code", None) == 8000
            or "space quota" in message
            or "writes are blocked" in message
        )
    )


def _fs():
    return firestore.client()


async def _soft_delete_vitrine_for_user(offer_id: str, uid: str, request: Request | None = None) -> dict:
    try:
        offer_oid = ObjectId(offer_id)
    except Exception:
        await audit_event(
            "vitrine_offer_delete_failed",
            uid=uid,
            status="blocked",
            metadata={"offerId": offer_id, "reason": "invalid_id"},
            request=request,
        )
        raise HTTPException(400, "ID inválido")

    owner_filter = {
        "_id": offer_oid,
        "$or": [
            {"created_by": uid},
            {"user_id": uid},
            {"owner_id": uid},
        ],
    }

    hard_deleted_due_quota = False
    try:
        result = await _db.vitrine_offers.update_one(
            owner_filter,
            {"$set": {"status": "deleted", "updated_at": datetime.now(timezone.utc)}},
        )
        matched_count = result.matched_count
    except OperationFailure as exc:
        if not _is_storage_quota_error(exc):
            logger.exception("[USERS] Erro Mongo ao excluir vitrine offer_id=%s uid=%s", offer_id, uid)
            await audit_event(
                "vitrine_offer_delete_failed",
                uid=uid,
                status="error",
                metadata={"offerId": offer_id, "reason": "mongo_error", "error": str(exc)[:180]},
                request=request,
            )
            raise HTTPException(500, "Erro no banco ao excluir a vitrine. Tente novamente em alguns segundos.")
        try:
            delete_result = await _db.vitrine_offers.delete_one(owner_filter)
        except Exception as delete_exc:
            logger.exception("[USERS] Erro Mongo ao hard-delete vitrine offer_id=%s uid=%s", offer_id, uid)
            await audit_event(
                "vitrine_offer_delete_failed",
                uid=uid,
                status="error",
                metadata={"offerId": offer_id, "reason": "mongo_delete_error", "error": str(delete_exc)[:180]},
                request=request,
            )
            raise HTTPException(500, "Erro no banco ao excluir a vitrine. Tente novamente em alguns segundos.")
        matched_count = delete_result.deleted_count
        hard_deleted_due_quota = matched_count > 0
    except Exception as exc:
        logger.exception("[USERS] Erro Mongo ao excluir vitrine offer_id=%s uid=%s", offer_id, uid)
        await audit_event(
            "vitrine_offer_delete_failed",
            uid=uid,
            status="error",
            metadata={"offerId": offer_id, "reason": "mongo_error", "error": str(exc)[:180]},
            request=request,
        )
        raise HTTPException(500, "Erro no banco ao excluir a vitrine. Tente novamente em alguns segundos.")

    if matched_count == 0:
        try:
            existing = await _db.vitrine_offers.find_one(
                {"_id": offer_oid},
                {"created_by": 1, "user_id": 1, "owner_id": 1, "status": 1},
            )
        except Exception as exc:
            logger.exception("[USERS] Erro Mongo ao conferir vitrine offer_id=%s uid=%s", offer_id, uid)
            await audit_event(
                "vitrine_offer_delete_failed",
                uid=uid,
                status="error",
                metadata={"offerId": offer_id, "reason": "mongo_lookup_error", "error": str(exc)[:180]},
                request=request,
            )
            raise HTTPException(500, "Erro no banco ao conferir a vitrine. Tente novamente em alguns segundos.")

        if existing and existing.get("status") == "deleted":
            return {"ok": True, "route": "users_fallback", "alreadyDeleted": True}

        await audit_event(
            "vitrine_offer_delete_failed",
            uid=uid,
            status="blocked",
            metadata={
                "offerId": offer_id,
                "reason": "not_found_for_user",
                "exists": bool(existing),
                "storedStatus": existing.get("status") if existing else None,
                "ownerHash": hash_identifier(existing.get("created_by")) if existing else None,
                "userIdHash": hash_identifier(existing.get("user_id")) if existing else None,
                "ownerIdHash": hash_identifier(existing.get("owner_id")) if existing else None,
            },
            request=request,
        )
        raise HTTPException(404, "Oferta não encontrada")

    await audit_event(
        "vitrine_offer_deleted",
        uid=uid,
        status="success",
        metadata={"offerId": offer_id, "route": "users_fallback", "hardDeletedDueQuota": hard_deleted_due_quota},
        request=request,
    )
    return {"ok": True, "route": "users_fallback", "hardDeletedDueQuota": hard_deleted_due_quota}


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
    referral_code: str | None = Field(default=None, max_length=40)
    referralCode: str | None = Field(default=None, max_length=40)


class BillingProfileRequest(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    nome: str | None = Field(default=None, max_length=120)
    cpf: str
    cpfCnpj: str | None = None
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


class VitrineStatusPayload(BaseModel):
    offer_id: str = Field(..., min_length=12, max_length=40)
    status: str = Field(..., max_length=20)


class ResourceStatePayload(BaseModel):
    resource: str = Field(..., max_length=40)
    resource_id: str = Field(..., min_length=12, max_length=40)
    state: str = Field(..., max_length=20)


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


@router.get("/partner/referrals")
async def get_partner_referrals(uid: str = Depends(get_user_id)):
    """Lista indicados do parceiro com dados mínimos: apenas nome e status."""
    db = _fs()

    def _load():
        partner = _partner_profile_for_user_sync(uid, db)
        code = partner["code"]
        docs_by_id = {}

        for field in ("referredByCode", "referralCode"):
            query = db.collection("users").where(field, "==", code).limit(300)
            for doc_snap in query.stream():
                docs_by_id[doc_snap.id] = doc_snap.to_dict() or {}

        referrals = []
        active_count = 0
        for referred_uid, data in docs_by_id.items():
            subscription_doc = db.collection("subscriptions").document(referred_uid).get()
            subscription = subscription_doc.to_dict() if subscription_doc.exists else {}
            status = str(subscription.get("status") or "").lower()
            if status == "active":
                active_count += 1

            referrals.append({
                "name": data.get("name") or data.get("nome") or data.get("displayName") or "RCA indicado",
                "status": status or "none",
                "statusLabel": _subscription_status_label(subscription),
            })

        referrals.sort(key=lambda item: (item["status"] != "active", item["name"].lower()))
        return {
            "partner": {
                "name": partner["name"],
                "code": code,
                "commissionMonthly": partner["commissionMonthly"],
                "discountPercent": partner["discountPercent"],
            },
            "metrics": {
                "totalReferrals": len(referrals),
                "activeSubscriptions": active_count,
                "estimatedMonthlyCommission": active_count * partner["commissionMonthly"],
            },
            "referrals": referrals,
        }

    return await asyncio.to_thread(_load)


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


@router.post("/vitrine-status")
async def update_vitrine_status_from_user_route(
    payload: VitrineStatusPayload,
    request: Request,
    uid: str = Depends(get_user_id),
):
    """Rota neutra para remover vitrine quando redes bloqueiam URLs com delete/excluir."""
    if payload.status != "removed":
        raise HTTPException(400, "Status inválido")
    return await _soft_delete_vitrine_for_user(payload.offer_id, uid, request=request)


@router.post("/resource-state")
async def update_resource_state_from_user_route(
    payload: ResourceStatePayload,
    request: Request,
    uid: str = Depends(get_user_id),
):
    """Rota genérica para atualizar estado de recurso sem palavras bloqueadas na URL."""
    if payload.resource != "catalog" or payload.state != "removed":
        raise HTTPException(400, "Operação inválida")
    return await _soft_delete_vitrine_for_user(payload.resource_id, uid, request=request)


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


@router.get("/resource-state-link")
async def update_resource_state_from_link(
    request: Request,
    resource: str = "",
    resource_id: str = "",
    state: str = "",
    token: str = "",
):
    """Fallback por imagem com URL neutra para redes que bloqueiam termos como delete/excluir."""
    if resource != "catalog" or state != "removed":
        raise HTTPException(400, "Operação inválida")
    uid = await _verify_user_token(token)
    await _soft_delete_vitrine_for_user(resource_id, uid, request=request)
    return Response(
        content=TRANSPARENT_GIF,
        media_type="image/gif",
        headers={"Cache-Control": "no-store, max-age=0"},
    )


@router.post("/resource-state-simple")
async def update_resource_state_simple(request: Request, resource: str = "", resource_id: str = "", state: str = ""):
    """Fallback POST simples sem Authorization header/preflight para navegadores restritivos."""
    if resource != "catalog" or state != "removed":
        raise HTTPException(400, "Operação inválida")
    raw_body = await request.body()
    token = _extract_simple_token(raw_body, request.query_params.get("token"))
    uid = await _verify_user_token(token)
    return await _soft_delete_vitrine_for_user(resource_id, uid, request=request)


@router.get("/resource-state-redirect")
async def update_resource_state_redirect(
    request: Request,
    resource: str = "",
    resource_id: str = "",
    state: str = "",
    token: str = "",
    next: str = "",
):
    """Fallback final por navegação direta; exclui e volta para a Vitrine."""
    target = _safe_frontend_redirect(next)
    headers = {"Cache-Control": "no-store, max-age=0"}
    try:
        if resource != "catalog" or state != "removed":
            raise HTTPException(400, "Operação inválida")
        uid = await _verify_user_token(token)
        await _soft_delete_vitrine_for_user(resource_id, uid, request=request)
        return RedirectResponse(
            _append_query(target, {"removed": "1", "fix": "redirect13"}),
            status_code=303,
            headers=headers,
        )
    except HTTPException as exc:
        return RedirectResponse(
            _append_query(target, {"remove_error": str(exc.detail), "fix": "redirect13"}),
            status_code=303,
            headers=headers,
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
    """Atualiza documento/telefone pelo backend, com validação e proteção contra duplicidade."""
    documento_bruto = payload.cpfCnpj or payload.cpf
    dados = _validar_dados_pagador(payload.name or payload.nome or "", documento_bruto, payload.telefone)
    if dados["documentoTipo"] == "cpf":
        cpf_duplicado, msg_duplicidade = await asyncio.to_thread(
            _verificar_duplicidade_cpf,
            dados["cpf"],
            _fs(),
            uid,
        )
        if cpf_duplicado:
            raise HTTPException(400, msg_duplicidade)

    update_data = {
        "name": dados["nome"],
        "nome": dados["nome"],
        "cpfCnpj": dados["cpfCnpj"],
        "documentoTipo": dados["documentoTipo"],
        "telefone": dados["telefone"],
        "updated_at": firestore.SERVER_TIMESTAMP,
    }
    if dados["cpf"]:
        update_data["cpf"] = dados["cpf"]
    if dados["cnpj"]:
        update_data["cnpj"] = dados["cnpj"]

    await asyncio.to_thread(
        _fs().collection("users").document(uid).set,
        update_data,
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

    if len(password) < 8:
        raise HTTPException(400, "A senha deve ter no mínimo 8 caracteres")

    dados_pagador = _validar_dados_pagador(nome, payload.cpf, payload.telefone)
    if dados_pagador["documentoTipo"] != "cpf":
        raise HTTPException(400, "Cadastro inicial exige CPF. O CNPJ pode ser informado no checkout de pagamento.")
    cpf = dados_pagador["cpf"]
    telefone_clean = dados_pagador["telefone"]
    referral_code = _normalize_referral_code(payload.referral_code or payload.referralCode)

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
            email_verified=True,
        )
        uid = user.uid
        logger.info("[REGISTER] Firebase user criado: uid=%s", uid)
    except Exception as e:
        logger.error("[REGISTER] Erro ao criar Firebase user: %s", e.__class__.__name__)
        error_text = str(e)
        if "EMAIL_EXISTS" in error_text or "already exists" in error_text.lower():
            raise HTTPException(400, "Este email já está cadastrado")
        elif "WEAK_PASSWORD" in error_text:
            raise HTTPException(400, "A senha é muito fraca. Use no mínimo 8 caracteres")
        raise HTTPException(400, "Erro ao criar usuário")

    # 6. Salva dados adicionais no Firestore (incluindo documento validado)
    user_data = {
        "email": email,
        "name": dados_pagador["nome"],
        "nome": dados_pagador["nome"],
        "cpf": cpf,
        "cpfCnpj": cpf,
        "documentoTipo": "cpf",
        "telefone": telefone_clean,
        "role": "user",
        "license_type": "trial",
        "requiresEmailVerification": False,
        "emailVerified": True,
        "emailVerifiedAt": firestore.SERVER_TIMESTAMP,
        "trial_ends_at": firestore.SERVER_TIMESTAMP,
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }
    user_data.update(_referral_user_data(referral_code))

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
