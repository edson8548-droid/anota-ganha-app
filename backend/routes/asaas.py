import asyncio
import logging
import os
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import firebase_admin
import requests
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth, firestore
from pydantic import BaseModel
from services.security_audit import audit_event
from services.security_config import is_production_environment

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer(auto_error=False)

DEFAULT_ASAAS_PLAN_ID = "monthly"
ASAAS_PLANS = {
    "monthly": {
        "id": "monthly",
        "price": 99.00,
        "cycle": "MONTHLY",
        "description": "Assinatura mensal VenPro",
    },
    "annual_upfront": {
        "id": "annual_upfront",
        "price": 828.00,
        "cycle": "YEARLY",
        "description": "Assinatura anual VenPro",
    },
    "annual_installments": {
        "id": "annual_installments",
        "price": 828.00,
        "cycle": "YEARLY",
        "description": "Assinatura anual VenPro",
    },
}


class CreateSubscriptionRequest(BaseModel):
    planId: str = DEFAULT_ASAAS_PLAN_ID


def _fs():
    if not firebase_admin._apps:
        raise HTTPException(status_code=500, detail="Firebase não inicializado")
    return firestore.client()


async def get_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    if not credentials:
        logger.warning("[SECURITY] auth_missing route=asaas")
        raise HTTPException(status_code=401, detail="Token obrigatório")
    try:
        decoded = await asyncio.to_thread(firebase_auth.verify_id_token, credentials.credentials)
        return decoded["uid"]
    except Exception:
        logger.warning("[SECURITY] auth_invalid route=asaas")
        raise HTTPException(status_code=401, detail="Token inválido")


def _asaas_base_url() -> str:
    return os.environ.get("ASAAS_BASE_URL", "https://api.asaas.com/v3").rstrip("/")


def _asaas_headers() -> dict:
    api_key = os.environ.get("ASAAS_API_KEY", "").strip()
    if not api_key:
        logger.error("ASAAS_API_KEY não configurada")
        raise HTTPException(status_code=500, detail="Asaas não configurado")
    return {
        "access_token": api_key,
        "Content-Type": "application/json",
    }


def _only_digits(value: Optional[str]) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def _asaas_plan(plan_id: str) -> dict:
    plan = ASAAS_PLANS.get(plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail="Plano inválido")
    return plan


def _period_end_for_plan(plan_id: str) -> datetime:
    days = 365 if ASAAS_PLANS.get(plan_id, {}).get("cycle") == "YEARLY" else 30
    return datetime.now(timezone.utc) + timedelta(days=days)


def _asaas_request(method: str, path: str, **kwargs) -> dict:
    url = f"{_asaas_base_url()}{path}"
    response = requests.request(method, url, headers=_asaas_headers(), timeout=30, **kwargs)
    if response.status_code >= 400:
        logger.error("[ASAAS] %s %s falhou: %s", method, path, response.text)
        raise HTTPException(status_code=502, detail="Erro ao comunicar com Asaas")
    return response.json() if response.content else {}


def _cancel_asaas_subscription(subscription_id: str) -> None:
    url = f"{_asaas_base_url()}/subscriptions/{subscription_id}"
    response = requests.delete(url, headers=_asaas_headers(), timeout=30)
    if response.status_code == 404:
        logger.warning("[ASAAS] Assinatura já não existe no Asaas: %s", subscription_id)
        return
    if response.status_code >= 400:
        logger.error("[ASAAS] DELETE /subscriptions/%s falhou: %s", subscription_id, response.text)
        raise HTTPException(status_code=502, detail="Erro ao cancelar assinatura no Asaas")


def _find_or_create_customer(uid: str, user_data: dict) -> str:
    existing_customer_id = user_data.get("asaasCustomerId")
    if existing_customer_id:
        return existing_customer_id

    lookup = _asaas_request(
        "GET",
        "/customers",
        params={"externalReference": uid, "limit": 1},
    )
    if lookup.get("data"):
        customer_id = lookup["data"][0]["id"]
        _fs().collection("users").document(uid).set(
            {"asaasCustomerId": customer_id, "updated_at": firestore.SERVER_TIMESTAMP},
            merge=True,
        )
        return customer_id

    name = (
        user_data.get("name")
        or user_data.get("displayName")
        or user_data.get("nome")
        or user_data.get("email")
        or "Cliente VenPro"
    )
    cpf_cnpj = _only_digits(user_data.get("cpf") or user_data.get("cpfCnpj"))
    phone = _only_digits(user_data.get("telefone") or user_data.get("phone"))

    if not cpf_cnpj:
        raise HTTPException(status_code=400, detail="CPF obrigatório para gerar cobrança")

    payload = {
        "name": name,
        "cpfCnpj": cpf_cnpj,
        "email": user_data.get("email"),
        "mobilePhone": phone or None,
        "externalReference": uid,
        "notificationDisabled": False,
    }
    payload = {k: v for k, v in payload.items() if v not in (None, "")}
    customer = _asaas_request("POST", "/customers", json=payload)
    customer_id = customer["id"]

    _fs().collection("users").document(uid).set(
        {"asaasCustomerId": customer_id, "updated_at": firestore.SERVER_TIMESTAMP},
        merge=True,
    )
    return customer_id


def _first_payment_for_subscription(subscription_id: str) -> dict:
    payments = _asaas_request("GET", f"/subscriptions/{subscription_id}/payments", params={"limit": 10})
    data = payments.get("data") or []
    if not data:
        raise HTTPException(status_code=502, detail="Asaas criou assinatura, mas não retornou cobrança inicial")
    return data[0]


def _find_subscription_user_id(payment: dict = None, subscription: dict = None) -> Optional[str]:
    payment = payment or {}
    subscription = subscription or {}

    external_reference = payment.get("externalReference") or subscription.get("externalReference") or ""
    for plan_id in ASAAS_PLANS:
        marker = f"-{plan_id}-"
        if marker in external_reference:
            return external_reference.split(marker, 1)[0]

    asaas_subscription_id = payment.get("subscription") or subscription.get("id")
    if asaas_subscription_id:
        docs = (
            _fs()
            .collection("subscriptions")
            .where("asaasSubscriptionId", "==", asaas_subscription_id)
            .limit(1)
            .stream()
        )
        for doc in docs:
            return doc.id
    return None


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


def _access_end_for_cancel(subscription_data: dict) -> datetime:
    now = datetime.now(timezone.utc)
    candidates = [
        _as_datetime(subscription_data.get("accessEndsAt")),
        _as_datetime(subscription_data.get("currentPeriodEnd")),
        _as_datetime(subscription_data.get("nextBillingDate")),
        _as_datetime(subscription_data.get("nextDueDate")),
    ]
    future_candidates = [candidate for candidate in candidates if candidate and candidate > now]
    if future_candidates:
        return min(future_candidates)

    last_payment = _as_datetime(subscription_data.get("lastPaymentDate"))
    if last_payment and last_payment + timedelta(days=30) > now:
        return last_payment + timedelta(days=30)

    return now + timedelta(days=30)


@router.post("/create-subscription")
async def create_subscription(payload: CreateSubscriptionRequest, uid: str = Depends(get_user_id)):
    try:
        plan = _asaas_plan(payload.planId)
    except HTTPException:
        await audit_event(
            "subscription_create_rejected",
            uid=uid,
            status="blocked",
            metadata={"reason": "invalid_plan", "planId": payload.planId},
        )
        raise

    user_ref = _fs().collection("users").document(uid)
    user_doc = user_ref.get()
    if not user_doc.exists:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    user_data = user_doc.to_dict() or {}
    customer_id = _find_or_create_customer(uid, user_data)
    external_reference = f"{uid}-{plan['id']}-{plan['price']:.2f}"

    subscription_payload = {
        "customer": customer_id,
        "billingType": "UNDEFINED",
        "value": plan["price"],
        "nextDueDate": date.today().isoformat(),
        "cycle": plan["cycle"],
        "description": plan["description"],
        "externalReference": external_reference,
        "callback": {
            "successUrl": os.environ.get("FRONTEND_URL", "https://venpro.com.br").rstrip("/") + "/payment-success",
            "autoRedirect": False,
        },
    }

    subscription = _asaas_request("POST", "/subscriptions", json=subscription_payload)
    subscription_id = subscription["id"]
    first_payment = _first_payment_for_subscription(subscription_id)
    payment_url = first_payment.get("invoiceUrl") or first_payment.get("bankSlipUrl")

    if not payment_url:
        logger.error("[ASAAS] Cobrança inicial sem invoiceUrl: %s", first_payment)
        raise HTTPException(status_code=502, detail="Asaas não retornou link de pagamento")

    _fs().collection("subscriptions").document(uid).set(
        {
            "userId": uid,
            "planId": plan["id"],
            "status": "pending",
            "provider": "asaas",
            "asaasCustomerId": customer_id,
            "asaasSubscriptionId": subscription_id,
            "asaasPaymentId": first_payment.get("id"),
            "externalReference": external_reference,
            "amount": plan["price"],
            "currency": "BRL",
            "paymentUrl": payment_url,
            "updatedAt": datetime.now(timezone.utc),
            "trialEndsAt": None,
        },
        merge=True,
    )
    await audit_event(
        "subscription_created",
        uid=uid,
        status="pending",
        metadata={"provider": "asaas", "planId": plan["id"], "amount": plan["price"]},
    )

    return {
        "provider": "asaas",
        "subscriptionId": subscription_id,
        "paymentId": first_payment.get("id"),
        "paymentUrl": payment_url,
        "invoiceUrl": payment_url,
    }


@router.post("/cancel-subscription")
async def cancel_subscription(uid: str = Depends(get_user_id)):
    subscription_ref = _fs().collection("subscriptions").document(uid)
    subscription_doc = subscription_ref.get()

    if not subscription_doc.exists:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")

    subscription_data = subscription_doc.to_dict() or {}
    asaas_subscription_id = subscription_data.get("asaasSubscriptionId")

    if asaas_subscription_id:
        _cancel_asaas_subscription(asaas_subscription_id)

    access_ends_at = _access_end_for_cancel(subscription_data)

    subscription_ref.set(
        {
            "userId": uid,
            "status": "canceling",
            "provider": subscription_data.get("provider") or "asaas",
            "canceledAt": datetime.now(timezone.utc),
            "accessEndsAt": access_ends_at,
            "cancelAtPeriodEnd": True,
            "updatedAt": datetime.now(timezone.utc),
            "cancelReason": "user_requested",
        },
        merge=True,
    )
    await audit_event(
        "subscription_cancel_requested",
        uid=uid,
        status="canceling",
        metadata={"provider": subscription_data.get("provider") or "asaas"},
    )

    logger.info(
        "[ASAAS] Recorrência cancelada, acesso mantido até o fim do período uid=%s asaasSubscriptionId=%s accessEndsAt=%s",
        uid,
        asaas_subscription_id,
        access_ends_at.isoformat(),
    )
    return {"status": "canceling", "accessEndsAt": access_ends_at.isoformat()}


@router.post("/webhook")
async def asaas_webhook(
    request: Request,
    asaas_access_token: Optional[str] = Header(default=None, alias="asaas-access-token"),
    asaas_access_token_underscore: Optional[str] = Header(default=None, alias="asaas_access_token"),
):
    expected_token = os.environ.get("ASAAS_WEBHOOK_TOKEN", "").strip()
    received_token = asaas_access_token or asaas_access_token_underscore
    if not expected_token and is_production_environment():
        logger.error("[SECURITY] asaas_webhook_token_missing_in_production")
        await audit_event("asaas_webhook_token_missing", status="blocked", request=request)
        raise HTTPException(status_code=503, detail="Webhook Asaas não configurado")
    if expected_token and received_token != expected_token:
        logger.warning("[SECURITY] asaas_webhook_invalid_token")
        await audit_event("asaas_webhook_invalid_token", status="blocked", request=request)
        raise HTTPException(status_code=401, detail="Token inválido")

    body = await request.json()
    event = body.get("event")
    payment = body.get("payment") or {}
    subscription = body.get("subscription") or {}
    uid = _find_subscription_user_id(payment=payment, subscription=subscription)

    if not uid:
        logger.info("[ASAAS] Evento sem usuário mapeado event=%s", event)
        await audit_event(
            "asaas_webhook_unmapped",
            status="ignored",
            metadata={"event": event},
            request=request,
        )
        return {"received": True}

    subscription_ref = _fs().collection("subscriptions").document(uid)
    existing_doc = subscription_ref.get()
    existing_data = existing_doc.to_dict() if existing_doc.exists else {}
    plan_id = existing_data.get("planId") or DEFAULT_ASAAS_PLAN_ID
    external_reference = payment.get("externalReference") or subscription.get("externalReference") or ""
    for known_plan_id in ASAAS_PLANS:
        if f"-{known_plan_id}-" in external_reference:
            plan_id = known_plan_id
            break

    update = {
        "provider": "asaas",
        "updatedAt": datetime.now(timezone.utc),
    }

    if event in {"PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"}:
        update.update(
            {
                "status": "active",
                "planId": plan_id,
                "asaasPaymentId": payment.get("id"),
                "asaasSubscriptionId": payment.get("subscription") or subscription.get("id"),
                "lastPaymentDate": datetime.now(timezone.utc),
                "currentPeriodEnd": _period_end_for_plan(plan_id),
                "amount": ASAAS_PLANS.get(plan_id, ASAAS_PLANS[DEFAULT_ASAAS_PLAN_ID])["price"],
                "nextDueDate": payment.get("dueDate"),
                "trialEndsAt": None,
            }
        )
    elif event in {"PAYMENT_OVERDUE", "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED"}:
        update.update(
            {
                "status": "pending",
                "asaasPaymentId": payment.get("id"),
                "asaasSubscriptionId": payment.get("subscription") or subscription.get("id"),
                "nextDueDate": payment.get("dueDate"),
            }
        )
    elif event in {"SUBSCRIPTION_INACTIVATED", "SUBSCRIPTION_DELETED"}:
        existing_access_end = _as_datetime(existing_data.get("accessEndsAt"))
        if existing_data.get("cancelAtPeriodEnd") and existing_access_end and existing_access_end > datetime.now(timezone.utc):
            update.update(
                {
                    "status": "canceling",
                    "asaasSubscriptionId": subscription.get("id") or payment.get("subscription"),
                    "canceledAt": existing_data.get("canceledAt") or datetime.now(timezone.utc),
                    "accessEndsAt": existing_access_end,
                    "cancelAtPeriodEnd": True,
                }
            )
        else:
            update.update(
                {
                    "status": "canceled",
                    "asaasSubscriptionId": subscription.get("id") or payment.get("subscription"),
                    "canceledAt": datetime.now(timezone.utc),
                }
            )
    elif event in {"PAYMENT_DELETED", "PAYMENT_REFUNDED"}:
        update.update(
            {
                "status": "canceled",
                "asaasPaymentId": payment.get("id"),
                "asaasSubscriptionId": payment.get("subscription") or subscription.get("id"),
                "canceledAt": datetime.now(timezone.utc),
            }
        )
    elif event in {"SUBSCRIPTION_CREATED", "SUBSCRIPTION_UPDATED", "PAYMENT_CREATED"}:
        update.update(
            {
                "asaasPaymentId": payment.get("id"),
                "asaasSubscriptionId": subscription.get("id") or payment.get("subscription"),
            }
        )
    else:
        logger.info("[ASAAS] Evento ignorado event=%s uid=%s", event, uid)
        await audit_event(
            "asaas_webhook_ignored",
            uid=uid,
            status="ignored",
            metadata={"event": event},
            request=request,
        )
        return {"received": True}

    subscription_ref.set(update, merge=True)
    await audit_event(
        "asaas_webhook_processed",
        uid=uid,
        status=update.get("status") or "processed",
        metadata={"event": event, "provider": "asaas"},
        request=request,
    )
    logger.info("[ASAAS] Evento processado event=%s uid=%s status=%s", event, uid, update.get("status"))
    return {"received": True}
