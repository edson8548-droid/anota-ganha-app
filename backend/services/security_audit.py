import asyncio
import hashlib
import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

import firebase_admin
from firebase_admin import firestore

logger = logging.getLogger(__name__)

AUDIT_COLLECTION = os.environ.get("AUDIT_COLLECTION", "security_audit")
SENSITIVE_KEYS = {
    "authorization",
    "token",
    "access_token",
    "asaas_access_token",
    "password",
    "senha",
    "cpf",
    "cpfcnpj",
    "telefone",
    "phone",
    "mobilephone",
}


def hash_identifier(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    salt = os.environ.get("AUDIT_HASH_SALT", "venpro-audit")
    raw = f"{salt}:{value}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:24]


def _client_ip(request) -> Optional[str]:
    if not request:
        return None
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _clean_value(value: Any, depth: int = 0) -> Any:
    if depth > 2:
        return "[truncated]"
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str):
        return value[:300]
    if isinstance(value, list):
        return [_clean_value(item, depth + 1) for item in value[:20]]
    if isinstance(value, dict):
        cleaned = {}
        for key, item in list(value.items())[:30]:
            key_str = str(key)
            key_norm = key_str.lower().replace("-", "_")
            if key_norm in SENSITIVE_KEYS or any(s in key_norm for s in ("token", "password", "senha")):
                cleaned[key_str] = "[redacted]"
            else:
                cleaned[key_str] = _clean_value(item, depth + 1)
        return cleaned
    return str(value)[:300]


def _request_metadata(request) -> dict:
    if not request:
        return {}
    return {
        "method": request.method,
        "path": request.url.path,
        "ipHash": hash_identifier(_client_ip(request)),
        "userAgent": (request.headers.get("user-agent") or "")[:180],
    }


def audit_event_sync(
    action: str,
    *,
    uid: Optional[str] = None,
    status: str = "info",
    metadata: Optional[dict] = None,
    request=None,
) -> None:
    try:
        if not firebase_admin._apps:
            logger.info("[AUDIT] skipped_no_firebase action=%s uid=%s status=%s", action, uid, status)
            return

        event = {
            "action": action,
            "status": status,
            "uid": uid,
            "metadata": _clean_value(metadata or {}),
            "request": _request_metadata(request),
            "createdAt": firestore.SERVER_TIMESTAMP,
            "createdAtIso": datetime.now(timezone.utc).isoformat(),
        }
        firestore.client().collection(AUDIT_COLLECTION).add(event)
    except Exception:
        logger.exception("[AUDIT] failed action=%s uid=%s status=%s", action, uid, status)


async def audit_event(
    action: str,
    *,
    uid: Optional[str] = None,
    status: str = "info",
    metadata: Optional[dict] = None,
    request=None,
) -> None:
    await asyncio.to_thread(
        audit_event_sync,
        action,
        uid=uid,
        status=status,
        metadata=metadata,
        request=request,
    )
