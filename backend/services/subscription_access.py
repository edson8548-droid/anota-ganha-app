import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from firebase_admin import firestore
from services.security_audit import audit_event


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


def _has_paid_access(subscription: dict, now: datetime) -> bool:
    access_end = _as_datetime(subscription.get("accessEndsAt"))
    if access_end and access_end > now:
        return True

    last_payment = _as_datetime(subscription.get("lastPaymentDate"))
    if last_payment and last_payment + timedelta(days=30) > now:
        return True

    return False


def _has_subscription_access_sync(uid: str) -> bool:
    doc = firestore.client().collection("subscriptions").document(uid).get()
    if not doc.exists:
        return False

    subscription = doc.to_dict() or {}
    status = subscription.get("status")
    now = datetime.now(timezone.utc)

    if status == "active":
        return True

    if status == "trialing":
        trial_end = _as_datetime(subscription.get("trialEndsAt"))
        return bool(trial_end and trial_end > now)

    if status in {"canceling", "canceled"}:
        return _has_paid_access(subscription, now)

    return False


async def ensure_subscription_access(uid: str) -> str:
    allowed = await asyncio.to_thread(_has_subscription_access_sync, uid)
    if not allowed:
        await audit_event("subscription_access_denied", uid=uid, status="blocked")
        raise HTTPException(
            status_code=403,
            detail="Assinatura inativa. Assine novamente para usar esta ferramenta.",
        )
    return uid
