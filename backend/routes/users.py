"""
Rotas de perfil de usuário — avatar via MongoDB GridFS.
"""
import io
import re
import asyncio
import logging
import os
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from firebase_admin import auth as firebase_auth, firestore
from services.public_files import stream_public_gridfs_file
from services.security_audit import audit_event, hash_identifier
from services.upload_validation import IMAGE_CONTENT_TYPES, safe_filename, validate_upload
from pydantic import BaseModel, EmailStr, Field

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer(auto_error=False)

_db = None

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


def _verificar_duplicidade_cpf(cpf: str, db) -> tuple[bool, str]:
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

        if usuarios:
            usuario_existente = usuarios[0]
            email_existente = usuario_existente.to_dict().get("email", "")
            nome_existente = usuario_existente.to_dict().get("name") or usuario_existente.to_dict().get("nome", "")

            return True, f"CPF já cadastrado para o usuário: {email_existente} ({nome_existente}). Use outro CPF ou entre em contato."
    except Exception:
        logger.warning("[SECURITY] Erro ao verificar duplicidade de CPF")
        return True, "Erro ao verificar duplicidade. Por favor, tente novamente."

    return False, "CPF disponível"

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


def _fs():
    return firestore.client()


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


class DeviceSessionPayload(BaseModel):
    deviceId: str = Field(..., min_length=16, max_length=160)
    platform: str | None = Field(default=None, max_length=80)
    language: str | None = Field(default=None, max_length=40)
    timezone: str | None = Field(default=None, max_length=80)
    screenWidth: int | None = Field(default=None, ge=0, le=20000)
    screenHeight: int | None = Field(default=None, ge=0, le=20000)
    appVersion: str | None = Field(default=None, max_length=40)


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
    cpf = _remover_caracteres_cpf(payload.cpf)
    telefone = payload.telefone

    logger.info("[REGISTER] Novo registro solicitado: email=%s", email)

    # 1. Validação básica de campos
    if not email or not password or not nome or not cpf or not telefone:
        raise HTTPException(400, "Todos os campos são obrigatórios")

    if not email or '@' not in email or '.' not in email:
        raise HTTPException(400, "Email inválido")

    if len(password) < 6:
        raise HTTPException(400, "A senha deve ter no mínimo 6 caracteres")

    # 2. Validação robusta de CPF
    cpf_valido, msg_cpf = _validar_formato_cpf(cpf)
    if not cpf_valido:
        raise HTTPException(400, f"CPF inválido: {msg_cpf}")

    if cpf == cpf[0] * 11:
        raise HTTPException(400, "CPF inválido")

    dv1_esperado, dv2_esperado = _calcular_digitos_verificadores(cpf)
    dv1_real, dv2_real = int(cpf[9]), int(cpf[10])
    if (dv1_esperado, dv2_esperado) != (dv1_real, dv2_real):
        raise HTTPException(400, "Dígitos verificadores do CPF incorretos")

    # 3. Verificação de duplicidade de CPF
    cpf_duplicado, msg_duplicidade = await asyncio.to_thread(_verificar_duplicidade_cpf, cpf, _fs())
    if cpf_duplicado:
        raise HTTPException(400, msg_duplicidade)

    # 4. Validação de telefone
    telefone_clean = re.sub(r'\D', '', telefone)
    if len(telefone_clean) < 10 or len(telefone_clean) > 11:
        raise HTTPException(400, "Telefone inválido. Inclua o DDD (mínimo 10 dígitos, máximo 11)")

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
        logger.error("[REGISTER] Erro ao criar Firebase user: %s", e)
        error_text = str(e)
        if "EMAIL_EXISTS" in error_text or "already exists" in error_text.lower():
            raise HTTPException(400, "Este email já está cadastrado")
        elif "WEAK_PASSWORD" in error_text:
            raise HTTPException(400, "A senha é muito fraca. Use no mínimo 6 caracteres")
        raise HTTPException(400, "Erro ao criar usuário")

    # 6. Salva dados adicionais no Firestore (incluindo CPF validado)
    user_data = {
        "email": email,
        "name": nome,
        "nome": nome,
        "cpf": cpf,
        "telefone": telefone_clean,
        "role": "user",
        "license_type": "trial",
        "trial_ends_at": firestore.SERVER_TIMESTAMP,
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }

    try:
        await asyncio.to_thread(_fs().collection("users").document(uid).set, user_data)
        logger.info("[REGISTER] Dados salvos no Firestore: uid=%s", uid)
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
