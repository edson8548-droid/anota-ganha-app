import asyncio
import os
import sys
from datetime import date

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes import asaas as asaas_routes
from routes.asaas import (
    ASAAS_PLANS,
    _asaas_error_detail,
    _find_or_create_customer,
    _create_single_payment,
    _find_customer_by_query,
    _find_reusable_pending_payment,
    _find_subscription_user_id,
    asaas_webhook,
)
from services.security_config import LOCAL_CORS_ORIGINS, PRODUCTION_CORS_ORIGINS, parse_cors_origins


class FakeRequest:
    async def json(self):
        return {"event": "IGNORED"}


class FakeAsaasResponse:
    status_code = 400
    text = ""

    def __init__(self, data):
        self._data = data

    def json(self):
        return self._data


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


def test_asaas_plan_prices_match_public_offer():
    assert ASAAS_PLANS["monthly"]["price"] == 69.90
    assert ASAAS_PLANS["monthly"]["cycle"] == "MONTHLY"
    assert "annual_upfront" not in ASAAS_PLANS
    assert asaas_routes.ASAAS_PAYMENT_MODE == "subscription"
    assert asaas_routes.ASAAS_SUBSCRIPTION_FALLBACK_TO_SINGLE is False


def test_asaas_finds_user_from_monthly_external_reference():
    payment = {"externalReference": "usuario-com-hifen-monthly-69.90"}

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
