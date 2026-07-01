import asyncio
import logging

from fastapi import HTTPException
from firebase_admin import firestore

logger = logging.getLogger(__name__)

EMAIL_NOT_VERIFIED_MESSAGE = (
    "Confirme seu email para liberar o acesso. "
    "Verifique também Spam, Lixo eletrônico e Promoções."
)


def should_block_unverified_email(user_data: dict | None, decoded_token: dict | None) -> bool:
    data = user_data or {}
    token = decoded_token or {}
    return bool(data.get("requiresEmailVerification")) and not bool(token.get("email_verified"))


async def ensure_email_verified_for_required_user(decoded_token: dict, route: str = "") -> str:
    uid = decoded_token.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Token inválido")

    user_ref = firestore.client().collection("users").document(uid)
    user_doc = await asyncio.to_thread(user_ref.get)
    if not getattr(user_doc, "exists", False):
        return uid

    user_data = user_doc.to_dict() or {}
    if not user_data.get("requiresEmailVerification"):
        return uid

    if decoded_token.get("email_verified"):
        if user_data.get("emailVerified") is not True:
            await asyncio.to_thread(
                user_ref.set,
                {
                    "emailVerified": True,
                    "emailVerifiedAt": firestore.SERVER_TIMESTAMP,
                    "updated_at": firestore.SERVER_TIMESTAMP,
                },
                merge=True,
            )
        return uid

    logger.warning("[SECURITY] email_not_verified route=%s uid=%s", route or "unknown", uid)
    raise HTTPException(status_code=403, detail=EMAIL_NOT_VERIFIED_MESSAGE)
