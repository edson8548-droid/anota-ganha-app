import asyncio
import os
import sys
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes import asaas as asaas_routes
from routes.asaas import (
    ASAAS_PLANS,
    PARCEIRO25_COUPON_CODE,
    _asaas_error_detail,
    _apply_subscription_coupon,
    _find_or_create_customer,
    _create_single_payment,
    _find_customer_by_query,
    _find_reusable_pending_payment,
    _find_subscription_user_id,
    _normalize_coupon_code,
    _release_subscription_coupon_usage,
    _reserve_subscription_coupon_usage,
    asaas_webhook,
)
from services.security_config import LOCAL_CORS_ORIGINS, PRODUCTION_CORS_ORIGINS, parse_cors_origins


class FakeRequest:
    def __init__(self, body=None):
        self._body = body or {"event": "IGNORED"}
        self.headers = {}
        self.method = "POST"
        self.url = type("Url", (), {"path": "/api/asaas/webhook"})()
        self.client = None

    async def json(self):
        return self._body


class FakeAsaasResponse:
    status_code = 400
    text = ""

    def __init__(self, data):
        self._data = data

    def json(self):
        return self._data


class FakeCouponSnapshot:
    def __init__(self, data):
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return dict(self._data or {})


class FakeCouponDocument:
    def __init__(self):
        self.data = None

    def create(self, data):
        if self.data is not None:
            raise asaas_routes.AlreadyExists("Document already exists")
        self.data = dict(data)

    def get(self):
        return FakeCouponSnapshot(self.data)

    def delete(self):
        self.data = None


class FakeCouponCollection:
    def __init__(self):
        self.docs = {}

    def document(self, doc_id):
        self.docs.setdefault(doc_id, FakeCouponDocument())
        return self.docs[doc_id]


class FakeCouponDb:
    def __init__(self):
        self.collections = {}

    def collection(self, name):
        self.collections.setdefault(name, FakeCouponCollection())
        return self.collections[name]


class FakeSnapshot:
    def __init__(self, data):
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return dict(self._data or {})


class FakeDocument:
    def __init__(self, data=None):
        self.data = data

    def get(self):
        return FakeSnapshot(self.data)

    def set(self, data, merge=False):
        if merge and self.data is not None:
            self.data.update(data)
        else:
            self.data = dict(data)


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = {doc_id: FakeDocument(data) for doc_id, data in (docs or {}).items()}

    def document(self, doc_id):
        self.docs.setdefault(doc_id, FakeDocument())
        return self.docs[doc_id]


class FakeDb:
    def __init__(self, collections=None):
        self.collections = {
            name: FakeCollection(docs)
            for name, docs in (collections or {}).items()
        }

    def collection(self, name):
        self.collections.setdefault(name, FakeCollection())
        return self.collections[name]


def test_cors_fallback_in_production_does_not_include_localhost(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    monkeypatch.setenv("APP_ENV", "production")

    origins = parse_cors_origins()

    assert origins == PRODUCTION_CORS_ORIGINS
    assert not any(origin in origins for origin in LOCAL_CORS_ORIGINS)


def test_cors_fallback_in_development_keeps_localhost(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("ENV", raising=False)
    monkeypatch.delenv("PYTHON_ENV", raising=False)
    monkeypatch.delenv("RENDER_SERVICE_ID", raising=False)

    origins = parse_cors_origins()

    assert "http://localhost:3000" in origins
    assert "https://venpro.com.br" in origins


def test_cors_uses_explicit_environment_origins(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("CORS_ORIGINS", "https://venpro.com.br/, https://app.exemplo.com")

    assert parse_cors_origins() == ["https://venpro.com.br", "https://app.exemplo.com"]


def test_asaas_webhook_requires_configured_token_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("ASAAS_WEBHOOK_TOKEN", raising=False)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(asaas_webhook(FakeRequest()))

    assert exc.value.status_code == 503


def test_asaas_webhook_rejects_invalid_token(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ASAAS_WEBHOOK_TOKEN", "token-correto")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(asaas_webhook(FakeRequest(), asaas_access_token="token-errado"))

    assert exc.value.status_code == 401


def test_asaas_overdue_does_not_revoke_current_paid_period(monkeypatch):
    uid = "uid-daniel"
    now = datetime.now(timezone.utc)
    fake_db = FakeDb({
        "subscriptions": {
            uid: {
                "status": "active",
                "planId": "monthly",
                "asaasPaymentId": "pay_received",
                "asaasSubscriptionId": "sub_123",
                "lastPaymentDate": now - timedelta(days=1),
                "currentPeriodEnd": now + timedelta(days=29),
            }
        }
    })

    async def fake_audit_event(*args, **kwargs):
        return None

    monkeypatch.delenv("ASAAS_WEBHOOK_TOKEN", raising=False)
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setattr(asaas_routes, "_fs", lambda: fake_db)
    monkeypatch.setattr(asaas_routes, "audit_event", fake_audit_event)

    body = {
        "event": "PAYMENT_OVERDUE",
        "payment": {
            "id": "pay_overdue",
            "subscription": "sub_123",
            "externalReference": f"{uid}-monthly-99.90",
            "dueDate": "2026-07-01",
        },
    }

    asyncio.run(asaas_webhook(FakeRequest(body)))

    data = fake_db.collection("subscriptions").document(uid).data
    assert data["status"] == "active"
    assert data["asaasPaymentId"] == "pay_received"
    assert data["lastPaymentIssueEvent"] == "PAYMENT_OVERDUE"
    assert data["lastPaymentIssuePaymentId"] == "pay_overdue"


def test_asaas_plan_prices_match_public_offer():
    assert ASAAS_PLANS["monthly"]["price"] == 99.90
    assert ASAAS_PLANS["monthly"]["cycle"] == "MONTHLY"
    assert "annual_upfront" not in ASAAS_PLANS
    assert asaas_routes.ASAAS_PAYMENT_MODE == "subscription"
    assert asaas_routes.ASAAS_SUBSCRIPTION_FALLBACK_TO_SINGLE is False


def test_parceiro25_coupon_accepts_percent_code_and_applies_half_up_discount():
    assert _normalize_coupon_code("parceiro25%off") == PARCEIRO25_COUPON_CODE

    discounted_plan, coupon = _apply_subscription_coupon(ASAAS_PLANS["monthly"], "parceiro25%off")

    assert discounted_plan["price"] == 74.93
    assert coupon["couponCode"] == PARCEIRO25_COUPON_CODE
    assert coupon["couponDisplayCode"] == "parceiro25%off"
    assert coupon["discountAmount"] == 24.97
    assert coupon["oneTime"] is True


def test_parceiro25_coupon_usage_is_global_one_time(monkeypatch):
    fake_db = FakeCouponDb()
    monkeypatch.setattr(asaas_routes, "_fs", lambda: fake_db)
    _, coupon = _apply_subscription_coupon(ASAAS_PLANS["monthly"], "parceiro25%off")

    first_usage = _reserve_subscription_coupon_usage("uid-primeiro", coupon)
    same_user_retry = _reserve_subscription_coupon_usage("uid-primeiro", coupon)

    assert first_usage == {"code": PARCEIRO25_COUPON_CODE, "created": True, "reusedBySameUser": False}
    assert same_user_retry == {"code": PARCEIRO25_COUPON_CODE, "created": False, "reusedBySameUser": True}

    with pytest.raises(HTTPException) as exc:
        _reserve_subscription_coupon_usage("uid-segundo", coupon)

    assert exc.value.status_code == 400
    assert "já foi usado" in exc.value.detail


def test_parceiro25_coupon_reservation_can_be_released_after_asaas_failure(monkeypatch):
    fake_db = FakeCouponDb()
    monkeypatch.setattr(asaas_routes, "_fs", lambda: fake_db)
    _, coupon = _apply_subscription_coupon(ASAAS_PLANS["monthly"], "parceiro25%off")

    first_usage = _reserve_subscription_coupon_usage("uid-primeiro", coupon)
    _release_subscription_coupon_usage(first_usage)
    second_usage = _reserve_subscription_coupon_usage("uid-segundo", coupon)

    assert second_usage == {"code": PARCEIRO25_COUPON_CODE, "created": True, "reusedBySameUser": False}


def test_asaas_finds_user_from_monthly_external_reference():
    payment = {"externalReference": "usuario-com-hifen-monthly-120.00-carlos14off"}

    assert _find_subscription_user_id(payment=payment) == "usuario-com-hifen"


def test_asaas_error_detail_redacts_sensitive_numbers_and_email():
    response = FakeAsaasResponse({
        "errors": [{
            "code": "invalid_customer",
            "description": "CPF 52998224725 do cliente joao@example.com é inválido",
        }]
    })

    detail = _asaas_error_detail(response)

    assert "52998224725" not in detail
    assert "joao@example.com" not in detail
    assert "invalid_customer" in detail


def test_asaas_single_payment_payload_uses_undefined_invoice(monkeypatch):
    captured = {}

    def fake_asaas_request(method, path, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["json"] = kwargs["json"]
        return {"id": "pay_123", "invoiceUrl": "https://asaas.test/invoice/pay_123"}

    monkeypatch.setattr(asaas_routes, "_asaas_request", fake_asaas_request)

    payment = _create_single_payment("cus_123", ASAAS_PLANS["monthly"], "uid-monthly-69.90")

    assert payment["invoiceUrl"] == "https://asaas.test/invoice/pay_123"
    assert captured["method"] == "POST"
    assert captured["path"] == "/payments"
    assert captured["json"]["billingType"] == "UNDEFINED"
    assert captured["json"]["externalReference"] == "uid-monthly-69.90"
    assert captured["json"]["dueDate"] >= date.today().isoformat()
    assert "callback" not in captured["json"]


def test_asaas_existing_customer_notifications_are_disabled(monkeypatch):
    calls = []

    def fake_asaas_request(method, path, **kwargs):
        calls.append({"method": method, "path": path, **kwargs})
        if method == "GET":
            return {"data": [{"id": "cus_123", "notificationDisabled": False}]}
        if method == "PUT":
            return {"id": "cus_123", "notificationDisabled": True}
        raise AssertionError(f"Unexpected request {method} {path}")

    monkeypatch.setattr(asaas_routes, "_asaas_request", fake_asaas_request)
    monkeypatch.setattr(asaas_routes, "_save_asaas_customer_id", lambda uid, customer_id: None)

    customer_id = _find_customer_by_query("uid-123", {"externalReference": "uid-123"})

    assert customer_id == "cus_123"
    assert calls[1]["method"] == "PUT"
    assert calls[1]["path"] == "/customers/cus_123"
    assert calls[1]["json"] == {"notificationDisabled": True}


def test_asaas_reuses_existing_pending_payment(monkeypatch):
    def fake_asaas_request(method, path, **kwargs):
        assert method == "GET"
        assert path == "/payments"
        assert kwargs["params"]["customer"] == "cus_123"
        return {
            "data": [
                {
                    "id": "pay_paid",
                    "status": "RECEIVED",
                    "externalReference": "uid-monthly-69.90",
                    "invoiceUrl": "https://asaas.test/i/paid",
                },
                {
                    "id": "pay_pending",
                    "status": "PENDING",
                    "externalReference": "uid-monthly-69.90",
                    "invoiceUrl": "https://asaas.test/i/pending",
                },
            ]
        }

    monkeypatch.setattr(asaas_routes, "_asaas_request", fake_asaas_request)

    payment = _find_reusable_pending_payment("cus_123", "uid-monthly-69.90")

    assert payment["id"] == "pay_pending"


def test_asaas_subscription_mode_reuses_only_subscription_payments(monkeypatch):
    def fake_asaas_request(method, path, **kwargs):
        assert method == "GET"
        assert path == "/payments"
        return {
            "data": [
                {
                    "id": "pay_detached",
                    "status": "PENDING",
                    "externalReference": "uid-monthly-69.90",
                    "invoiceUrl": "https://asaas.test/i/detached",
                },
                {
                    "id": "pay_subscription",
                    "status": "PENDING",
                    "subscription": "sub_123",
                    "externalReference": "uid-monthly-69.90",
                    "invoiceUrl": "https://asaas.test/i/subscription",
                },
            ]
        }

    monkeypatch.setattr(asaas_routes, "_asaas_request", fake_asaas_request)

    payment = _find_reusable_pending_payment(
        "cus_123",
        "uid-monthly-69.90",
        require_subscription=True,
    )

    assert payment["id"] == "pay_subscription"
    assert payment["subscription"] == "sub_123"


def test_asaas_does_not_reuse_deleted_pending_payment(monkeypatch):
    def fake_asaas_request(method, path, **kwargs):
        return {
            "data": [
                {
                    "id": "pay_deleted",
                    "status": "PENDING",
                    "deleted": True,
                    "externalReference": "uid-monthly-69.90",
                    "invoiceUrl": "https://asaas.test/i/deleted",
                }
            ]
        }

    monkeypatch.setattr(asaas_routes, "_asaas_request", fake_asaas_request)

    assert _find_reusable_pending_payment("cus_123", "uid-monthly-69.90") is None


def test_asaas_customer_prefers_cpf_cnpj_over_legacy_cpf(monkeypatch):
    calls = []

    def fake_asaas_request(method, path, **kwargs):
        calls.append({"method": method, "path": path, **kwargs})
        if method == "GET":
            return {"data": []}
        if method == "POST":
            return {"id": "cus_123"}
        raise AssertionError(f"Unexpected request {method} {path}")

    monkeypatch.setattr(asaas_routes, "_asaas_request", fake_asaas_request)
    monkeypatch.setattr(asaas_routes, "_save_asaas_customer_id", lambda uid, customer_id: None)

    customer_id = _find_or_create_customer(
        "uid-123",
        {
            "name": "Empresa Teste",
            "email": "empresa@example.com",
            "cpf": "52998224725",
            "cpfCnpj": "04252011000110",
            "telefone": "13999001234",
        },
    )

    assert customer_id == "cus_123"
    assert calls[-1]["method"] == "POST"
    assert calls[-1]["json"]["cpfCnpj"] == "04252011000110"
