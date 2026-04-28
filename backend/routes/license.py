"""
Rotas de validação de licença — chamadas pelo agente local no PC do assinante.

Fluxo:
1. Assinante se cadastra → license_key gerada automaticamente no Firestore
2. Assinante copia a chave do painel web para o arquivo agente.cfg
3. Agente chama POST /api/license/validate na inicialização e a cada 1h
4. Se assinatura venceu → servidor retorna active=False → agente encerra
"""

import os
import uuid
import logging
from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from typing import Optional
import firebase_admin
from firebase_admin import firestore, auth as firebase_auth

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer(auto_error=False)


def get_db():
    if not firebase_admin._apps:
        raise HTTPException(status_code=500, detail="Firebase não inicializado")
    return firestore.client()


def _gerar_chave():
    raw = uuid.uuid4().hex.upper()
    return f"{raw[0:4]}-{raw[4:8]}-{raw[8:12]}-{raw[12:16]}"


# ─── Modelos ───────────────────────────────────────────────────────────────────

class ValidateRequest(BaseModel):
    license_key: str
    hardware_id: Optional[str] = None


class GenerateKeyRequest(BaseModel):
    user_id: str
    firebase_token: str  # Firebase ID token para verificar autenticidade


class CouponRequest(BaseModel):
    coupon_code: str


# ─── POST /api/license/validate ────────────────────────────────────────────────

@router.post("/validate")
async def validate_license(payload: ValidateRequest):
    """
    Chamado pelo agente local no PC do assinante.
    Verifica se a chave de licença corresponde a uma assinatura ativa.
    """
    if not payload.license_key or len(payload.license_key) < 10:
        return {"active": False, "message": "Chave de licença inválida."}

    db = get_db()

    # Busca usuário pela chave
    users_query = db.collection("users").where("license_key", "==", payload.license_key).limit(1)
    users = list(users_query.stream())

    if not users:
        logger.warning(f"Tentativa com chave desconhecida: {payload.license_key[:4]}****")
        return {"active": False, "message": "Chave não encontrada. Verifique no painel web."}

    user_doc = users[0]
    user_id = user_doc.id
    user_data = user_doc.to_dict()

    # Verifica assinatura
    sub_ref = db.collection("subscriptions").document(user_id)
    sub_doc = sub_ref.get()

    if not sub_doc.exists:
        return {"active": False, "message": "Sem assinatura ativa. Acesse o painel para assinar."}

    sub = sub_doc.to_dict()
    status = sub.get("status", "")
    now = datetime.now(timezone.utc)

    if status == "active":
        logger.info(f"Licença validada: {user_id} ({user_data.get('name', '')})")
        return {
            "active": True,
            "message": "Licença ativa",
            "plan": sub.get("planId", "monthly"),
            "user_name": user_data.get("name", "Assinante"),
        }

    if status == "trialing":
        trial_end = sub.get("trialEndsAt")
        if trial_end:
            # Firestore timestamp → datetime
            if hasattr(trial_end, "timestamp"):
                trial_end = datetime.fromtimestamp(trial_end.timestamp(), tz=timezone.utc)
            if now < trial_end:
                days_left = max(0, (trial_end - now).days)
                return {
                    "active": True,
                    "message": f"Trial ativo — {days_left} dia(s) restante(s)",
                    "plan": "trial",
                    "user_name": user_data.get("name", "Assinante"),
                }
        return {"active": False, "message": "Trial expirado. Acesse o painel para assinar."}

    mensagens = {
        "canceled": "Assinatura cancelada. Renove no painel para continuar.",
        "trial_expired": "Trial expirado. Acesse o painel para assinar.",
        "suspended": "Assinatura suspensa. Entre em contato com o suporte.",
        "pending": "Pagamento pendente. Aguarde a confirmação.",
    }
    msg = mensagens.get(status, f"Assinatura inativa ({status}). Acesse o painel.")
    return {"active": False, "message": msg}


# ─── GET /api/license/key/{user_id} ────────────────────────────────────────────

@router.get("/key/{user_id}")
async def get_or_create_license_key(
    user_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """
    Retorna (ou gera) a chave de licença do usuário.
    Chamado pelo painel web para exibir a chave ao assinante.
    Requer Firebase ID token no header Authorization: Bearer <token>
    """
    # Verifica o Firebase ID token
    if not credentials:
        raise HTTPException(status_code=401, detail="Token de autenticação obrigatório")

    try:
        decoded = firebase_auth.verify_id_token(credentials.credentials)
        uid_token = decoded.get("uid")
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")

    # Só o próprio usuário ou admin pode ver a chave
    db = get_db()
    user_ref = db.collection("users").document(user_id)
    user_doc = user_ref.get()

    if not user_doc.exists:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    user_data = user_doc.to_dict()
    is_admin = user_data.get("role") == "admin"

    if uid_token != user_id and not is_admin:
        raise HTTPException(status_code=403, detail="Acesso negado")

    license_key = user_data.get("license_key")
    if not license_key:
        license_key = _gerar_chave()
        user_ref.update({"license_key": license_key, "updated_at": datetime.now(timezone.utc)})
        logger.info(f"Chave gerada para {user_id}")

    return {"license_key": license_key}


# ─── POST /api/license/regenerate ──────────────────────────────────────────────

@router.post("/regenerate")
async def regenerate_license_key(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """
    Gera uma nova chave de licença (invalida a anterior).
    Use quando o assinante achar que a chave foi comprometida.
    """
    if not credentials:
        raise HTTPException(status_code=401, detail="Token obrigatório")

    try:
        decoded = firebase_auth.verify_id_token(credentials.credentials)
        user_id = decoded.get("uid")
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")

    db = get_db()
    nova_chave = _gerar_chave()
    db.collection("users").document(user_id).update({
        "license_key": nova_chave,
        "updated_at": datetime.now(timezone.utc),
    })

    logger.info(f"Chave regenerada: {user_id}")
    return {"license_key": nova_chave, "message": "Nova chave gerada. Atualize o arquivo agente.cfg."}


# ─── POST /api/license/apply-coupon ─────────────────────────────────────────

@router.post("/apply-coupon")
async def apply_coupon(
    payload: CouponRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """
    Aplica um cupom de desconto — estende o trial para N dias.
    Chamado pelo painel web quando o usuário digita o código.
    """
    if not credentials:
        raise HTTPException(status_code=401, detail="Token obrigatório")

    try:
        decoded = firebase_auth.verify_id_token(credentials.credentials)
        user_id = decoded.get("uid")
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")

    code = payload.coupon_code.strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Código do cupom não pode ser vazio")

    db = get_db()

    # Busca cupom
    coupon_ref = db.collection("coupons").document(code)
    coupon_doc = coupon_ref.get()

    if not coupon_doc.exists:
        raise HTTPException(status_code=404, detail="Cupom não encontrado")

    coupon = coupon_doc.to_dict()
    now = datetime.now(timezone.utc)

    # Validações
    if not coupon.get("active", False):
        raise HTTPException(status_code=400, detail="Cupom desativado")

    if coupon.get("used_count", 0) >= coupon.get("max_uses", 0):
        raise HTTPException(status_code=400, detail="Cupom esgotado")

    expires_at = coupon.get("expires_at")
    if expires_at:
        if hasattr(expires_at, "timestamp"):
            expires_at = datetime.fromtimestamp(expires_at.timestamp(), tz=timezone.utc)
        if now > expires_at:
            raise HTTPException(status_code=400, detail="Cupom expirado")

    # Tudo ok — aplica o cupom
    days_free = coupon.get("days_free", 30)
    new_trial_end = now + timedelta(days=days_free)

    # Cria ou estende subscription
    sub_ref = db.collection("subscriptions").document(user_id)
    sub_doc = sub_ref.get()

    if sub_doc.exists:
        sub = sub_doc.to_dict()
        current_end = sub.get("trialEndsAt")
        if current_end and hasattr(current_end, "timestamp"):
            current_end = datetime.fromtimestamp(current_end.timestamp(), tz=timezone.utc)

        # Se trial ainda ativo, estende a partir do fim atual
        if sub.get("status") == "trialing" and current_end and current_end > now:
            new_trial_end = current_end + timedelta(days=days_free)

        sub_ref.update({
            "status": "trialing",
            "trialEndsAt": new_trial_end,
            "coupon_code": code,
            "updatedAt": now,
        })
    else:
        sub_ref.set({
            "userId": user_id,
            "status": "trialing",
            "trialEndsAt": new_trial_end,
            "coupon_code": code,
            "updatedAt": now,
        })

    # Incrementa uso do cupom
    coupon_ref.update({"used_count": firestore.Increment(1)})

    logger.info(f"Cupom {code} aplicado para {user_id}: +{days_free} dias (até {new_trial_end})")
    return {
        "success": True,
        "message": f"Cupom aplicado! +{days_free} dias grátis.",
        "days_free": days_free,
        "trial_ends_at": new_trial_end.isoformat(),
    }
