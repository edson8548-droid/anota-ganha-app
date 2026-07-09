"""
Rotas de validação de licença — chamadas pelo agente local no PC do assinante.

Fluxo:
1. Assinante se cadastra → license_key gerada automaticamente no Firestore
2. Assinante copia a chave do painel web para o arquivo agente.cfg
3. Agente chama POST /api/license/validate na inicialização e a cada 1h
4. Se assinatura venceu → servidor retorna active=False → agente encerra
"""

import os
import re
import uuid
import logging
from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from typing import Optional
import firebase_admin
from firebase_admin import firestore, auth as firebase_auth
from services.email_verification_access import (
    ensure_email_verified_for_required_user,
)

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


def _as_datetime(value) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if hasattr(value, "timestamp"):
        return datetime.fromtimestamp(value.timestamp(), tz=timezone.utc)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _paid_access_until(subscription: dict) -> Optional[datetime]:
    for field in ("accessEndsAt", "currentPeriodEnd"):
        access_end = _as_datetime(subscription.get(field))
        if access_end:
            return access_end

    last_payment = _as_datetime(subscription.get("lastPaymentDate"))
    if last_payment:
        return last_payment + timedelta(days=30)

    return None


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
            trial_end = _as_datetime(trial_end)
            if trial_end and now < trial_end:
                days_left = max(0, (trial_end - now).days)
                return {
                    "active": True,
                    "message": f"Trial ativo — {days_left} dia(s) restante(s)",
                    "plan": "trial",
                    "user_name": user_data.get("name", "Assinante"),
                }
        return {"active": False, "message": "Trial expirado. Acesse o painel para assinar."}

    if status in {"pending", "canceling", "canceled"}:
        paid_until = _paid_access_until(sub)
        if paid_until and paid_until > now:
            return {
                "active": True,
                "message": "Licença ativa",
                "plan": sub.get("planId", "monthly"),
                "user_name": user_data.get("name", "Assinante"),
            }

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
        logger.warning("[SECURITY] auth_missing route=license_key")
        raise HTTPException(status_code=401, detail="Token de autenticação obrigatório")

    try:
        decoded = firebase_auth.verify_id_token(credentials.credentials)
        uid_token = await ensure_email_verified_for_required_user(decoded, route="license_key")
    except HTTPException:
        raise
    except Exception:
        logger.warning("[SECURITY] auth_invalid route=license_key")
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")

    # Só o próprio usuário ou admin pode ver a chave
    db = get_db()
    user_ref = db.collection("users").document(user_id)
    user_doc = user_ref.get()

    if not user_doc.exists:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    if uid_token != user_id:
        requester_doc = db.collection("users").document(uid_token).get()
        requester_is_admin = requester_doc.exists and requester_doc.to_dict().get("role") == "admin"
    else:
        requester_is_admin = False

    if uid_token != user_id and not requester_is_admin:
        logger.warning("[SECURITY] access_denied route=license_key reason=user_mismatch")
        raise HTTPException(status_code=403, detail="Acesso negado")

    user_data = user_doc.to_dict()

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
        logger.warning("[SECURITY] auth_missing route=license_regenerate")
        raise HTTPException(status_code=401, detail="Token obrigatório")

    try:
        decoded = firebase_auth.verify_id_token(credentials.credentials)
        user_id = await ensure_email_verified_for_required_user(decoded, route="license_regenerate")
    except HTTPException:
        raise
    except Exception:
        logger.warning("[SECURITY] auth_invalid route=license_regenerate")
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
        logger.warning("[SECURITY] auth_missing route=license_coupon")
        raise HTTPException(status_code=401, detail="Token obrigatório")

    try:
        decoded = firebase_auth.verify_id_token(credentials.credentials)
        user_id = await ensure_email_verified_for_required_user(decoded, route="license_coupon")
    except HTTPException:
        raise
    except Exception:
        logger.warning("[SECURITY] auth_invalid route=license_coupon")
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


class CreateCouponRequest(BaseModel):
    code: str
    description: str = ""
    max_uses: int = 10
    days_free: int = 30
    expires_at: Optional[str] = None  # ISO format


@router.post("/admin/create-coupon")
async def admin_create_coupon(
    payload: CreateCouponRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    if not credentials:
        logger.warning("[SECURITY] auth_missing route=license_admin_coupon")
        raise HTTPException(status_code=401, detail="Token obrigatório")

    try:
        decoded = firebase_auth.verify_id_token(credentials.credentials)
        user_id = await ensure_email_verified_for_required_user(decoded, route="license_admin_coupon")
    except HTTPException:
        raise
    except Exception:
        logger.warning("[SECURITY] auth_invalid route=license_admin_coupon")
        raise HTTPException(status_code=401, detail="Token inválido")

    db = get_db()
    user_doc = db.collection("users").document(user_id).get()
    if not user_doc.exists or user_doc.to_dict().get("role") != "admin":
        logger.warning("[SECURITY] access_denied route=license_admin_coupon reason=not_admin")
        raise HTTPException(status_code=403, detail="Apenas admins podem criar cupons")

    code = payload.code.strip().upper()
    now = datetime.now(timezone.utc)

    coupon_data = {
        "code": code,
        "description": payload.description,
        "max_uses": payload.max_uses,
        "used_count": 0,
        "days_free": payload.days_free,
        "active": True,
        "created_at": now,
    }

    if payload.expires_at:
        coupon_data["expires_at"] = datetime.fromisoformat(payload.expires_at.replace("Z", "+00:00"))

    db.collection("coupons").document(code).set(coupon_data)

    logger.info(f"Cupom criado: {code} por admin {user_id}")
    return {"success": True, "message": f"Cupom {code} criado com {payload.max_uses} usos de {payload.days_free} dias"}


# ─── POST /api/license/validate-by-cpf ─────────────────────────────────────────

class ValidateByCpfRequest(BaseModel):
    cpf: str


@router.post("/validate-by-cpf")
async def validate_by_cpf(payload: ValidateByCpfRequest):
    """
    Chamado pelo APK Android do RCA.
    Verifica acesso pelo CPF cadastrado — sem necessidade de login.
    """
    cpf = re.sub(r"[^\d]", "", payload.cpf or "")
    if len(cpf) != 11:
        return {"active": False, "message": "CPF invalido. Verifique e tente novamente."}

    db = get_db()

    users_query = db.collection("users").where("cpf", "==", cpf).limit(1)
    users = list(users_query.stream())

    if not users:
        logger.warning(f"APK: CPF nao encontrado hash={cpf[:3]}****")
        return {"active": False, "message": "CPF nao encontrado. Verifique ou cadastre-se em venpro.com.br"}

    user_doc = users[0]
    user_id = user_doc.id
    user_data = user_doc.to_dict()

    if user_data.get("role") == "admin":
        logger.info(f"APK: acesso admin liberado uid={user_id}")
        return {"active": True, "message": "Acesso liberado", "user_name": user_data.get("name", "Admin")}

    sub_ref = db.collection("subscriptions").document(user_id)
    sub_doc = sub_ref.get()

    if not sub_doc.exists:
        return {"active": False, "message": "Sem assinatura ativa. Acesse venpro.com.br para assinar."}

    sub = sub_doc.to_dict()
    status = sub.get("status", "")
    now = datetime.now(timezone.utc)

    if status == "active":
        logger.info(f"APK: acesso liberado uid={user_id} nome={user_data.get('name', '')}")
        return {
            "active": True,
            "message": "Acesso liberado",
            "plan": sub.get("planId", "monthly"),
            "user_name": user_data.get("name", "Assinante"),
        }

    if status == "trialing":
        trial_end = _as_datetime(sub.get("trialEndsAt"))
        if trial_end and now < trial_end:
            days_left = max(0, (trial_end - now).days)
            return {
                "active": True,
                "message": f"Trial ativo — {days_left} dia(s) restante(s)",
                "plan": "trial",
                "user_name": user_data.get("name", "Assinante"),
            }
        return {"active": False, "message": "Trial expirado. Acesse venpro.com.br para assinar."}

    if status in {"pending", "canceling", "canceled"}:
        paid_until = _paid_access_until(sub)
        if paid_until and paid_until > now:
            return {
                "active": True,
                "message": "Acesso liberado",
                "plan": sub.get("planId", "monthly"),
                "user_name": user_data.get("name", "Assinante"),
            }

    mensagens = {
        "canceled": "Assinatura cancelada. Renove em venpro.com.br para continuar.",
        "suspended": "Assinatura suspensa. Entre em contato com o suporte.",
        "pending": "Pagamento pendente. Aguarde a confirmacao.",
    }
    msg = mensagens.get(status, f"Assinatura inativa ({status}). Acesse venpro.com.br.")
    return {"active": False, "message": msg}
