"""
Campanhas mestre (compartilhadas) — modelo de REFERÊNCIA VIVA.

- Admin (você) cria/edita/exclui a campanha MESTRE (fonte única da verdade),
  guardada no Mongo e protegida por `_require_admin`.
- O RCA desbloqueia com a senha UMA vez → o acesso fica gravado (permanente).
  Depois ele apenas LÊ a mestre (sem cópia): toda edição do admin reflete na
  hora para todos.
- Metas, clientes e progresso do RCA ficam na conta dele (Firestore), fora
  daqui — cada RCA cadastra as próprias metas e nada disso toca a mestre.

A senha é guardada só como hash (sha256 + salt), nunca em texto puro.
"""
import os
import re
import hashlib
import logging
import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from bson import ObjectId
from bson.errors import InvalidId
import firebase_admin  # noqa: F401  (garante init do app antes do verify)
from firebase_admin import auth as firebase_auth

from routes.admin import _admin_allowed_emails
from services.email_verification_access import ensure_email_verified_for_required_user
from services.subscription_access import ensure_subscription_access

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer(auto_error=False)

_db = None

# Salt dedicado; cai para AUDIT_HASH_SALT e por fim um default fixo (funciona
# mesmo sem env configurada, apenas com menos entropia).
_SALT = (
    os.environ.get("SHARED_CAMPAIGN_SALT")
    or os.environ.get("AUDIT_HASH_SALT")
    or "venpro-shared-campaign-salt"
)

# Mínimo 6: senha curta demais fica vulnerável a chute mesmo com rate limit.
CODE_MIN_LEN = 6


def init_campanhas_compartilhadas(database):
    global _db
    _db = database


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _hash_code(code: str) -> str:
    """Hash estável da senha (case-insensitive, sem espaços nas pontas)."""
    normal = (code or "").strip().lower()
    return hashlib.sha256(f"{_SALT}:{normal}".encode("utf-8")).hexdigest()


def _slugify(texto: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", (texto or "").strip().lower()).strip("-")
    return base or "campanha"


def _oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(400, "ID inválido")


_META_FIELDS = ("targetValue", "alreadySoldValue", "meta", "metaSugerida")


def _normalizar_industries(industries: dict) -> dict:
    """Estrutura da mestre: indústrias → produtos {codigo, nome, ean}.

    A mestre NÃO carrega meta (as metas são do RCA). Aceita tanto o formato
    {Indústria: {produtos: {key: {...}}}} quanto {Indústria: {key: {...}}}.
    """
    limpo = {}
    for ind_nome, ind_data in (industries or {}).items():
        if not isinstance(ind_data, dict):
            continue
        fonte = ind_data.get("produtos") if isinstance(ind_data.get("produtos"), dict) else ind_data
        produtos = {}
        for chave, prod in fonte.items():
            if chave in _META_FIELDS or chave == "produtos":
                continue
            if isinstance(prod, dict):
                nome = str(prod.get("nome") or chave).strip()
                produtos[nome] = {
                    "codigo": str(prod.get("codigo") or "").strip(),
                    "nome": nome,
                    "ean": str(prod.get("ean") or "").strip(),
                }
            else:
                nome = str(chave).strip()
                produtos[nome] = {"codigo": "", "nome": nome, "ean": ""}
        limpo[str(ind_nome).strip()] = {"produtos": produtos}
    return limpo


def _valor_publico(value):
    """Converte valores legados/BSON para tipos seguros no JSON da API."""
    if isinstance(value, dict):
        return {str(key): _valor_publico(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_valor_publico(item) for item in value]
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, ObjectId):
        return str(value)
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _data_publica(doc: dict) -> str | None:
    value = doc.get("updated_at") or doc.get("created_at")
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str):
        return value
    return str(value)


def _mestre_publica(doc: dict) -> dict:
    """Forma devolvida ao RCA/admin (sem o hash da senha)."""
    return {
        "id": str(doc["_id"]),
        "slug": doc.get("slug"),
        "distribuidora": doc.get("distribuidora") or "",
        "nome": doc.get("nome"),
        "descricao": doc.get("descricao") or "",
        "regulamento": doc.get("regulamento") or "",
        "objetivosGerais": doc.get("objetivosGerais") or "",
        "startDate": doc.get("startDate"),
        "endDate": doc.get("endDate"),
        "categorias": _valor_publico(doc.get("categorias") or []),
        "materiaisApoio": _valor_publico(doc.get("materiaisApoio") or []),
        "industries": _valor_publico(doc.get("industries") or {}),
        "active": bool(doc.get("active", True)),
        "temSenha": bool(doc.get("code_hash")),
        "updated_at": _data_publica(doc),
    }


async def _require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """Gate da campanha sem depender de uma leitura adicional no Firestore.

    O token Firebase já é assinado e a permissão continua limitada à allowlist
    administrativa. Isso evita indisponibilizar a campanha quando o Firestore
    usado pelo relatório operacional estiver lento ou indisponível.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(401, "Token obrigatório")
    try:
        decoded = await asyncio.to_thread(firebase_auth.verify_id_token, credentials.credentials)
    except Exception:
        logger.warning("[SECURITY] auth_invalid route=campanhas_admin")
        raise HTTPException(401, "Token inválido")

    uid = str(decoded.get("uid") or "").strip()
    email = str(decoded.get("email") or "").strip().lower()
    if not uid or not email:
        raise HTTPException(401, "Token inválido")
    if email not in _admin_allowed_emails():
        logger.warning("[SECURITY] access_denied route=campanhas_admin uid=%s", uid)
        raise HTTPException(403, "Apenas admins podem acessar este painel")
    return uid


async def _rca_uid(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Auth do RCA: token válido + e-mail verificado + assinatura ativa."""
    if not credentials or not credentials.credentials:
        raise HTTPException(401, "Token obrigatório")
    try:
        decoded = await asyncio.to_thread(firebase_auth.verify_id_token, credentials.credentials)
    except Exception:
        logger.warning("[SECURITY] auth_invalid route=campanhas_mestre")
        raise HTTPException(401, "Token inválido")
    uid = await ensure_email_verified_for_required_user(decoded, route="campanhas_mestre")
    await ensure_subscription_access(uid)
    return uid


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class MestreCreate(BaseModel):
    nome: str
    code: str
    distribuidora: str | None = None
    descricao: str | None = None
    regulamento: str | None = None
    objetivosGerais: str | None = None
    startDate: str | None = None
    endDate: str | None = None
    categorias: list = Field(default_factory=list)
    materiaisApoio: list = Field(default_factory=list)
    industries: dict = Field(default_factory=dict)
    active: bool = True
    slug: str | None = None


class MestreUpdate(BaseModel):
    nome: str | None = None
    code: str | None = None  # só troca a senha se vier
    distribuidora: str | None = None
    descricao: str | None = None
    regulamento: str | None = None
    objetivosGerais: str | None = None
    startDate: str | None = None
    endDate: str | None = None
    categorias: list | None = None
    materiaisApoio: list | None = None
    industries: dict | None = None
    active: bool | None = None


class DesbloquearPayload(BaseModel):
    code: str


# ---------------------------------------------------------------------------
# ADMIN — CRUD da campanha mestre (só admin)
# ---------------------------------------------------------------------------
@router.post("/admin/mestre")
async def criar_mestre(payload: MestreCreate, admin_uid: str = Depends(_require_admin)):
    nome = (payload.nome or "").strip()
    if not nome:
        raise HTTPException(400, "Nome da campanha é obrigatório")
    if len((payload.code or "").strip()) < CODE_MIN_LEN:
        raise HTTPException(400, f"A senha precisa ter ao menos {CODE_MIN_LEN} caracteres")

    agora = datetime.now(timezone.utc)
    doc = {
        "slug": _slugify(payload.slug or nome),
        "distribuidora": (payload.distribuidora or "").strip(),
        "nome": nome,
        "descricao": payload.descricao or "",
        "regulamento": payload.regulamento or "",
        "objetivosGerais": payload.objetivosGerais or "",
        "startDate": payload.startDate,
        "endDate": payload.endDate,
        "categorias": payload.categorias or [],
        "materiaisApoio": payload.materiaisApoio or [],
        "industries": _normalizar_industries(payload.industries),
        "code_hash": _hash_code(payload.code),
        "active": bool(payload.active),
        "created_by": admin_uid,
        "created_at": agora,
        "updated_at": agora,
    }
    result = await _db.master_campaigns.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _mestre_publica(doc)


@router.get("/admin/mestre")
async def listar_mestre_admin(admin_uid: str = Depends(_require_admin)):
    out = []
    async for doc in _db.master_campaigns.find().sort("created_at", -1):
        out.append(_mestre_publica(doc))
    return out


@router.get("/admin/mestre/{mestre_id}")
async def detalhe_mestre_admin(mestre_id: str, admin_uid: str = Depends(_require_admin)):
    doc = await _db.master_campaigns.find_one({"_id": _oid(mestre_id)})
    if not doc:
        raise HTTPException(404, "Campanha mestre não encontrada")
    return _mestre_publica(doc)


@router.put("/admin/mestre/{mestre_id}")
async def editar_mestre(mestre_id: str, payload: MestreUpdate, admin_uid: str = Depends(_require_admin)):
    oid = _oid(mestre_id)
    if not await _db.master_campaigns.find_one({"_id": oid}):
        raise HTTPException(404, "Campanha mestre não encontrada")

    campos = {"updated_at": datetime.now(timezone.utc)}
    if payload.nome is not None:
        nome = payload.nome.strip()
        if not nome:
            raise HTTPException(400, "Nome não pode ficar vazio")
        campos["nome"] = nome
    for attr in ("distribuidora", "descricao", "regulamento", "objetivosGerais", "startDate", "endDate"):
        val = getattr(payload, attr)
        if val is not None:
            campos[attr] = val
    if payload.categorias is not None:
        campos["categorias"] = payload.categorias
    if payload.materiaisApoio is not None:
        campos["materiaisApoio"] = payload.materiaisApoio
    if payload.industries is not None:
        campos["industries"] = _normalizar_industries(payload.industries)
    if payload.active is not None:
        campos["active"] = bool(payload.active)
    if payload.code is not None and payload.code.strip():
        if len(payload.code.strip()) < CODE_MIN_LEN:
            raise HTTPException(400, f"A senha precisa ter ao menos {CODE_MIN_LEN} caracteres")
        campos["code_hash"] = _hash_code(payload.code)

    await _db.master_campaigns.update_one({"_id": oid}, {"$set": campos})
    doc = await _db.master_campaigns.find_one({"_id": oid})
    return _mestre_publica(doc)


@router.delete("/admin/mestre/{mestre_id}")
async def excluir_mestre(mestre_id: str, admin_uid: str = Depends(_require_admin)):
    oid = _oid(mestre_id)
    result = await _db.master_campaigns.delete_one({"_id": oid})
    if result.deleted_count == 0:
        raise HTTPException(404, "Campanha mestre não encontrada")
    # Remove os acessos concedidos a essa campanha
    await _db.campaign_access.delete_many({"master_id": str(oid)})
    return {"ok": True}


# ---------------------------------------------------------------------------
# RCA — desbloquear (1x) e listar as liberadas (acesso automático depois)
# ---------------------------------------------------------------------------
@router.post("/desbloquear")
async def desbloquear(payload: DesbloquearPayload, uid: str = Depends(_rca_uid)):
    code = (payload.code or "").strip()
    if len(code) < CODE_MIN_LEN:
        raise HTTPException(400, "Senha inválida")

    doc = await _db.master_campaigns.find_one({"code_hash": _hash_code(code), "active": True})
    if not doc:
        raise HTTPException(404, "Código inválido ou campanha não encontrada")

    master_id = str(doc["_id"])
    # Grava o acesso (permanente). Upsert evita duplicar se já tiver entrado.
    await _db.campaign_access.update_one(
        {"uid": uid, "master_id": master_id},
        {"$setOnInsert": {"uid": uid, "master_id": master_id, "granted_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"acesso": True, "campanha": _mestre_publica(doc)}


@router.get("/minhas")
async def minhas_campanhas(uid: str = Depends(_rca_uid)):
    """Campanhas mestre que o RCA já liberou — acesso automático, sem senha."""
    ids = []
    async for acc in _db.campaign_access.find({"uid": uid}):
        try:
            ids.append(ObjectId(acc["master_id"]))
        except (InvalidId, TypeError, KeyError):
            continue
    if not ids:
        return []

    out = []
    async for doc in _db.master_campaigns.find({"_id": {"$in": ids}, "active": True}).sort("created_at", -1):
        out.append(_mestre_publica(doc))
    return out
