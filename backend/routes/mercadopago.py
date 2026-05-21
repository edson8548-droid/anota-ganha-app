import logging
import os
from typing import Optional

import firebase_admin
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials, firestore
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()
security = HTTPBearer(auto_error=False)


class UserInfoPayload(BaseModel):
    id: str
    email: str
    name: str


class PreferencePayload(BaseModel):
    planId: str
    user: UserInfoPayload
    deviceId: Optional[str] = None
    paymentMethod: Optional[str] = None


def initialize_firebase():
    if firebase_admin._apps:
        return firestore.client()
    try:
        firebase_config = {
            "type": "service_account",
            "project_id": os.environ.get("FIREBASE_PROJECT_ID"),
            "private_key_id": os.environ.get("FIREBASE_PRIVATE_KEY_ID"),
            "private_key": (os.environ.get("FIREBASE_PRIVATE_KEY") or "").replace("\\n", "\n"),
            "client_email": os.environ.get("FIREBASE_CLIENT_EMAIL"),
            "client_id": os.environ.get("FIREBASE_CLIENT_ID"),
            "token_uri": "https://oauth2.googleapis.com/token",
        }
        if not firebase_config["project_id"] or not firebase_config["private_key"]:
            raise ValueError("Variáveis FIREBASE_... não configuradas.")
        cred = credentials.Certificate(firebase_config)
        storage_bucket = os.environ.get("FIREBASE_STORAGE_BUCKET", "anota-ganha-app.firebasestorage.app")
        firebase_admin.initialize_app(cred, {"storageBucket": storage_bucket})
        logger.info("✅ Firebase Admin SDK inicializado.")
        return firestore.client()
    except Exception as exc:
        logger.error("❌ ERRO GRAVE: Falha ao inicializar o Firebase Admin: %s", exc)
        return None


def setup_mercadopago():
    logger.info("Mercado Pago desativado. Checkout ativo: Asaas.")


def get_authenticated_uid(credentials_token: HTTPAuthorizationCredentials = Depends(security)) -> str:
    if not credentials_token:
        logger.warning("[SECURITY] auth_missing route=mercadopago_create_preference")
        raise HTTPException(status_code=401, detail="Token obrigatório")
    try:
        decoded = firebase_auth.verify_id_token(credentials_token.credentials)
        return decoded.get("uid")
    except Exception:
        logger.warning("[SECURITY] auth_invalid route=mercadopago_create_preference")
        raise HTTPException(status_code=401, detail="Token inválido")


@router.post("/create-preference")
async def create_preference(
    payload: PreferencePayload,
    authenticated_uid: str = Depends(get_authenticated_uid),
):
    logger.warning("[SECURITY] mercado_pago_create_preference_disabled uid=%s plan=%s", authenticated_uid, payload.planId)
    raise HTTPException(
        status_code=410,
        detail="Mercado Pago desativado. Use o checkout Asaas.",
    )


@router.post("/webhook")
async def webhook(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    logger.info(
        "[SECURITY] mercado_pago_webhook_disabled type=%s",
        body.get("type") if isinstance(body, dict) else None,
    )
    return {"status": "disabled", "provider": "mercadopago"}
