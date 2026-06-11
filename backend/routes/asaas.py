import asyncio
import logging
import os
import re
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
ASAAS_PAYMENT_MODE = os.environ.get("ASAAS_PAYMENT_MODE", "subscription").strip().lower()
ASAAS_SUBSCRIPTION_FALLBACK_TO_SINGLE = (
    os.environ.get("ASAAS_SUBSCRIPTION_FALLBACK_TO_SINGLE", "false").strip().lower()
    in {"1", "true", "yes"}
)
ASAAS_DISABLE_CUSTOMER_NOTIFICATIONS = (
    os.environ.get("ASAAS_DISABLE_CUSTOMER_NOTIFICATIONS", "true").strip().lower()
    not in {"0", "false", "no"}
)
ASAAS_PLANS = {
    "monthly": {
        "id": "monthly",
        "price": 139.90,
        "cycle": "MONTHLY",
        "description": "Assinatura mensal Venpro",
    },
}
PARTNER_COUPONS = {
    "carlos14off": {
        "partnerName": "Carlos Vinicios",
        "finalPrice": 120.00,
        "discountLabel": "14% OFF",
        "commissionMonthly": 40.00,
    }
}


class CreateSubscriptionRequest(BaseModel):
    planId: str = DEFAULT_ASAAS_PLAN_ID
    couponCode: str | None = None


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


def _redact_asaas_detail(value: str) -> str:
    detail = str(value or "")
    detail = re.sub(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", "[email]", detail)
    detail = re.sub(r"\b\d{8,}\b", "[numero]", detail)
    detail = re.sub(r"access_token=[^&\s]+", "access_token=[redacted]", detail, flags=re.IGNORECASE)
    return detail[:500]


def _asaas_error_detail(response) -> str:
    try:
        data = response.json()
    except ValueError:
        return _redact_asaas_detail(response.text[:500])

    errors = data.get("errors") if isinstance(data, dict) else None
    if isinstance(errors, list) and errors:
        parts = []
        for error in errors[:3]:
            if not isinstance(error, dict):
                parts.append(str(error))
                continue
            code = error.get("code")
            description = error.get("description") or error.get("message")
            if code and description:
                parts.append(f"{code}: {description}")
            elif description:
                parts.append(str(description))
            elif code:
                parts.append(str(code))
        return _redact_asaas_detail("; ".join(parts))

    for key in ("description", "message", "error"):
        if isinstance(data, dict) and data.get(key):
            return _redact_asaas_detail(data[key])

    return _redact_asaas_detail(str(data)[:500])


def _asaas_plan(plan_id: str) -> dict:
    plan = ASAAS_PLANS.get(plan_id)
    if not plan:
        raise HTTPException(status_code=400, detail="Plano inválido")
    return dict(plan)


def _normalize_coupon_code(value: str | None) -> str:
    return re.sub(r"[^a-z0-9_-]", "", str(value or "").strip().lower())[:40]


def _coupon_candidate(payload_code: str | None, user_data: dict) -> str:
    return _normalize_coupon_code(
        payload_code
        or user_data.get("referredByCode")
        or user_data.get("referralCode")
        or user_data.get("referredByPartnerCode")
    )


def _apply_subscription_coupon(plan: dict, code: str) -> tuple[dict, dict | None]:
    normalized = _normalize_coupon_code(code)
    config = PARTNER_COUPONS.get(normalized)
    if not config or plan.get("id") != "monthly":
        return plan, None

    original_price = float(plan["price"])
    final_price = min(original_price, float(config["finalPrice"]))
    if final_price >= original_price:
        return plan, None

    discounted_plan = {
        **plan,
        "price": round(final_price, 2),
        "description": f"{plan['description']} - cupom {normalized}",
    }
    coupon_data = {
        "couponCode": normalized,
        "couponType": "partner_subscription_discount",
        "partnerName": config["partnerName"],
        "originalAmount": round(original_price, 2),
        "discountAmount": round(original_price - final_price, 2),
        "discountLabel": config["discountLabel"],
        "partnerCommissionMonthly": config["commissionMonthly"],
    }
    return discounted_plan, coupon_data


def _period_end_for_plan(plan_id: str) -> datetime:
    days = 365 if ASAAS_PLANS.get(plan_id, {}).get("cycle") == "YEARLY" else 30
    return datetime.now(timezone.utc) + timedelta(days=days)


def _due_date_for_new_charge() -> str:
    # Amanhã evita rejeição por diferenças de fuso/virada de dia em boleto,
    # mas Pix/cartão continuam pagáveis imediatamente pela invoiceUrl.
    return (date.today() + timedelta(days=1)).isoformat()


def _asaas_request(method: str, path: str, allowed_statuses: set[int] | None = None, **kwargs) -> dict:
    url = f"{_asaas_base_url()}{path}"
    allowed_statuses = allowed_statuses or set()
    response = requests.request(method, url, headers=_asaas_headers(), timeout=30, **kwargs)
    if response.status_code in allowed_statuses:
        data = response.json() if response.content else {}
        if isinstance(data, dict):
            data["_status_code"] = response.status_code
        return data
    if response.status_code >= 400:
        detail = _asaas_error_detail(response)
        logger.error(
            "[ASAAS] %s %s falhou status=%s detail=%s",
            method,
            path,
            response.status_code,
            detail or "sem detalhe",
        )
        if response.status_code in (401, 403):
            raise HTTPException(status_code=502, detail="Asaas recusou a autenticação. Verifique a chave API configurada.")
        raise HTTPException(status_code=502, detail=f"Asaas recusou a cobrança: {detail}" if detail else "Erro ao comunicar com Asaas")
    return response.json() if response.content else {}


def _cancel_asaas_subscription(subscription_id: str) -> None:
    url = f"{_asaas_base_url()}/subscriptions/{subscription_id}"
    response = requests.delete(url, headers=_asaas_headers(), timeout=30)
    if response.status_code == 404:
        logger.warning("[ASAAS] Assinatura já não existe no Asaas: %s", subscription_id)
        return
    if response.status_code >= 400:
        logger.error(
            "[ASAAS] DELETE /subscriptions/%s falhou status=%s body_len=%s",
            subscription_id,
            response.status_code,
            len(response.text or ""),
        )
        raise HTTPException(status_code=502, detail="Erro ao cancelar assinatura no Asaas")


def _save_asaas_customer_id(uid: str, customer_id: str) -> None:
    _fs().collection("users").document(uid).set(
        {"asaasCustomerId": customer_id, "updated_at": firestore.SERVER_TIMESTAMP},
        merge=True,
    )


def _ensure_customer_notifications_disabled(customer_id: str, customer: dict | None = None) -> None:
    if not ASAAS_DISABLE_CUSTOMER_NOTIFICATIONS:
        return
    if customer and customer.get("notificationDisabled") is True:
        return
    _asaas_request("PUT", f"/customers/{customer_id}", json={"notificationDisabled": True})


def _find_customer_by_query(uid: str, params: dict) -> Optional[str]:
    lookup = _asaas_request("GET", "/customers", params={**params, "limit": 1})
    if lookup.get("data"):
        customer = lookup["data"][0]
        customer_id = customer["id"]
        _ensure_customer_notifications_disabled(customer_id, customer)
        _save_asaas_customer_id(uid, customer_id)
        return customer_id
    return None


def _find_or_create_customer(uid: str, user_data: dict) -> str:
    existing_customer_id = user_data.get("asaasCustomerId")
    if existing_customer_id:
        customer = _asaas_request(
            "GET",
            f"/customers/{existing_customer_id}",
            allowed_statuses={404},
        )
        if customer.get("id"):
            _ensure_customer_notifications_disabled(existing_customer_id, customer)
            return existing_customer_id
        logger.warning("[ASAAS] asaasCustomerId salvo não encontrado; buscando por CPF/externalReference uid=%s", uid)

    customer_id = _find_customer_by_query(uid, {"externalReference": uid})
    if customer_id:
        return customer_id

    name = (
        user_data.get("name")
        or user_data.get("displayName")
        or user_data.get("nome")
        or user_data.get("email")
        or "Cliente Venpro"
    )
    cpf_cnpj = _only_digits(user_data.get("cpfCnpj") or user_data.get("cpf") or user_data.get("cnpj"))
    phone = _only_digits(user_data.get("telefone") or user_data.get("phone"))

    if not cpf_cnpj:
        raise HTTPException(status_code=400, detail="CPF ou CNPJ obrigatório para gerar cobrança")

    customer_id = _find_customer_by_query(uid, {"cpfCnpj": cpf_cnpj})
    if customer_id:
        return customer_id

    payload = {
        "name": name,
        "cpfCnpj": cpf_cnpj,
        "email": user_data.get("email"),
        "mobilePhone": phone or None,
        "externalReference": uid,
        "notificationDisabled": ASAAS_DISABLE_CUSTOMER_NOTIFICATIONS,
    }
    payload = {k: v for k, v in payload.items() if v not in (None, "")}
    customer = _asaas_request("POST", "/customers", json=payload)
    customer_id = customer["id"]
    _save_asaas_customer_id(uid, customer_id)
    return customer_id


def _first_payment_for_subscription(subscription_id: str) -> dict:
    payments = _asaas_request("GET", f"/subscriptions/{subscription_id}/payments", params={"limit": 10})
    data = payments.get("data") or []
    if not data:
        raise HTTPException(status_code=502, detail="Asaas criou assinatura, mas não retornou cobrança inicial")
    return data[0]


def _payment_url(payment: dict) -> str | None:
    return payment.get("invoiceUrl") or payment.get("bankSlipUrl")


def _find_reusable_pending_payment(
    customer_id: str,
    external_reference: str,
    require_subscription: bool = False,
) -> dict | None:
    payments = _asaas_request("GET", "/payments", params={"customer": customer_id, "limit": 10})
    for payment in payments.get("data") or []:
        if payment.get("deleted"):
            continue
        if payment.get("status") != "PENDING":
            continue
        if payment.get("externalReference") != external_reference:
            continue
        if require_subscription and not payment.get("subscription"):
            continue
        if _payment_url(payment):
            return payment
    return None


def _create_single_payment(customer_id: str, plan: dict, external_reference: str) -> dict:
    payment_payload = {
        "customer": customer_id,
        "billingType": "UNDEFINED",
        "value": plan["price"],
        "dueDate": _due_date_for_new_charge(),
        "description": plan["description"],
        "externalReference": external_reference,
    }
    payment = _asaas_request("POST", "/payments", json=payment_payload)
    payment_url = _payment_url(payment)
    if not payment_url:
        logger.error(
            "[ASAAS] Cobrança avulsa sem invoiceUrl payment=%s keys=%s",
            payment.get("id"),
            sorted(payment.keys()),
        )
        raise HTTPException(status_code=502, detail="Asaas não retornou link de pagamento")
    return payment


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
    requested_coupon = _coupon_candidate(payload.couponCode, user_data)
    plan, coupon_data = _apply_subscription_coupon(plan, requested_coupon)
    customer_id = _find_or_create_customer(uid, user_data)
    external_reference = f"{uid}-{plan['id']}-{plan['price']:.2f}"
    if coupon_data:
        external_reference = f"{external_reference}-{coupon_data['couponCode']}"

    use_subscription_mode = ASAAS_PAYMENT_MODE == "subscription"
    subscription_id = None
    billing_mode = "subscription" if use_subscription_mode else "single_payment"
    reusable_payment = _find_reusable_pending_payment(
        customer_id,
        external_reference,
        require_subscription=use_subscription_mode,
    )

    if reusable_payment:
        first_payment = reusable_payment
        subscription_id = reusable_payment.get("subscription") if use_subscription_mode else None
        billing_mode = "subscription_reuse" if use_subscription_mode else "single_payment_reuse"
    elif use_subscription_mode:
        subscription_payload = {
            "customer": customer_id,
            "billingType": "UNDEFINED",
            "value": plan["price"],
            "nextDueDate": _due_date_for_new_charge(),
            "cycle": plan["cycle"],
            "description": plan["description"],
            "externalReference": external_reference,
        }
        try:
            subscription = _asaas_request("POST", "/subscriptions", json=subscription_payload)
            subscription_id = subscription["id"]
            first_payment = _first_payment_for_subscription(subscription_id)
            billing_mode = "subscription"
        except HTTPException as exc:
            logger.warning(
                "[ASAAS] Falha ao criar assinatura; tentando cobrança avulsa uid=%s status=%s detail=%s",
                uid,
                exc.status_code,
                exc.detail,
            )
            if not ASAAS_SUBSCRIPTION_FALLBACK_TO_SINGLE:
                raise
            first_payment = _create_single_payment(customer_id, plan, external_reference)
            billing_mode = "single_payment_fallback"
    else:
        first_payment = _create_single_payment(customer_id, plan, external_reference)

    payment_url = _payment_url(first_payment)

    if not payment_url:
        logger.error(
            "[ASAAS] Cobrança inicial sem invoiceUrl subscription=%s payment=%s keys=%s",
            subscription_id,
            first_payment.get("id"),
            sorted(first_payment.keys()),
        )
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
            "baseAmount": coupon_data["originalAmount"] if coupon_data else plan["price"],
            "amount": plan["price"],
            "currency": "BRL",
            "paymentMethod": "UNDEFINED",
            "billingMode": billing_mode,
            "paymentUrl": payment_url,
            "updatedAt": datetime.now(timezone.utc),
            "trialEndsAt": None,
            **(coupon_data or {}),
        },
        merge=True,
    )
    await audit_event(
        "subscription_created",
        uid=uid,
        status="pending",
        metadata={
            "provider": "asaas",
            "planId": plan["id"],
            "amount": plan["price"],
            "billingMode": billing_mode,
            "couponCode": coupon_data.get("couponCode") if coupon_data else None,
        },
    )

    response = {
        "provider": "asaas",
        "subscriptionId": subscription_id,
        "paymentId": first_payment.get("id"),
        "paymentMethod": "UNDEFINED",
        "billingMode": billing_mode,
        "paymentUrl": payment_url,
        "invoiceUrl": payment_url,
    }
    if coupon_data:
        response["coupon"] = {
            "code": coupon_data["couponCode"],
            "originalAmount": coupon_data["originalAmount"],
            "discountAmount": coupon_data["discountAmount"],
            "amount": plan["price"],
        }
    return response


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
                "amount": payment.get("value") or existing_data.get("amount") or ASAAS_PLANS.get(plan_id, ASAAS_PLANS[DEFAULT_ASAAS_PLAN_ID])["price"],
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
