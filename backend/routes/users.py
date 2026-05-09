"""
Rotas de perfil de usuário — avatar via MongoDB GridFS.
"""
import io
import re
import asyncio
import logging
import os
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from firebase_admin import auth as firebase_auth, firestore
from bson import ObjectId
from services.upload_validation import IMAGE_CONTENT_TYPES, safe_filename, validate_upload
from pydantic import BaseModel, EmailStr, Field, validator

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
    Calcula os dígitos verificadores do CPF.

    Posição:            1 2 3 4 5 6 7 8 9 10 11
    Dígito:             X X X X X X X X X V
    Multiplicador:    10 11 10 10  2  1  2  1  2  1
    """
    if len(cpf) != 11:
        return 0, 0  # CPF inválido

    # Cálculo dos 9 primeiros dígitos
    soma = sum(int(d) for d in cpf[:9])
    resto = soma % 11

    # Determina o dígito verificador esperado
    dv_esperado = 11 - resto if resto < 10 else 0

    dv_real = int(cpf[9])

    return dv_esperado, dv_real


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
            nome_existente = usuario_existente.to_dict().get("name", "")

            return False, f"CPF já cadastrado para o usuário: {email_existente} ({nome_existente}). Use outro CPF ou entre em contato."
    except Exception:
        logger.warning(f"[SECURITY] Erro ao verificar duplicidade de CPF: {cpf_limpo}")
        return False, "Erro ao verificar duplicidade. Por favor, tente novamente."

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
    try:
        grid_out = await _gridfs().open_download_stream(ObjectId(grid_id))
        content_type = (grid_out.metadata or {}).get("content_type", "image/jpeg")
        return StreamingResponse(grid_out, media_type=content_type)
    except Exception:
        raise HTTPException(404, "Avatar não encontrado")


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
    nome: str
    cpf: str
    telefone: str


@router.post("/register")
async def register(
    email: str,
    password: str,
    nome: str,
    cpf: str,
    telefone: str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
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
    logger.info(f"[REGISTER] Novo registro: email={email}, cpf={cpf}")

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

    dv_esperado, dv_real = _calcular_digitos_verificadores(cpf)
    if dv_esperado != dv_real:
        raise HTTPException(400, f"Dígitos verificadores incorretos. Esperado: {dv_esperado}, Recebido: {dv_real}")

    # 3. Verificação de duplicidade de CPF
    cpf_duplicado, msg_duplicidade = await _verificar_duplicidade_cpf(cpf, _fs())
    if not cpf_duplicado:
        raise HTTPException(400, msg_duplicidade)

    # 4. Validação de telefone
    telefone_clean = re.sub(r'\D', '', telefone)
    if len(telefone_clean) < 10 or len(telefone_clean) > 11:
        raise HTTPException(400, "Telefone inválido. Inclua o DDD (mínimo 10 dígitos, máximo 11)")

    # 5. Cria usuário no Firebase Auth
    try:
        user_credential = await firebase_auth.create_user_with_email_and_password(email, password)
        uid = user_credential.uid
        logger.info(f"[REGISTER] Firebase user criado: uid={uid}")
    except Exception as e:
        logger.error(f"[REGISTER] Erro ao criar Firebase user: {e}")
        if "EMAIL_EXISTS" in str(e):
            raise HTTPException(400, "Este email já está cadastrado")
        elif "WEAK_PASSWORD" in str(e):
            raise HTTPException(400, "A senha é muito fraca. Use no mínimo 6 caracteres")
        raise HTTPException(400, f"Erro ao criar usuário: {str(e)}")

    # 6. Salva dados adicionais no Firestore (incluindo CPF validado)
    user_data = {
        "email": email,
        "nome": nome,
        "cpf": cpf,  # ✅ CPF validado (11 dígitos, sem formatação)
        "telefone": telefone_clean,
        "role": "user",
        "license_type": "trial",
        "trial_ends_at": firestore.SERVER_TIMESTAMP,
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }

    try:
        await _fs().collection("users").document(uid).set(user_data)
        logger.info(f"[REGISTER] Dados salvos no Firestore: uid={uid}, cpf={cpf}")
    except Exception as e:
        logger.error(f"[REGISTER] Erro ao salvar dados: {e}")
        raise HTTPException(500, f"Erro ao salvar dados: {str(e)}")

    return {
        "uid": uid,
        "email": email,
        "nome": nome,
        "message": "Usuário registrado com sucesso"
    }
