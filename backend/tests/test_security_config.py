import asyncio
import os
import sys
from datetime import date

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes import asaas as asaas_routes
from routes.asaas import ASAAS_PLANS, _asaas_error_detail, _create_single_payment, _find_subscription_user_id, asaas_webhook
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
