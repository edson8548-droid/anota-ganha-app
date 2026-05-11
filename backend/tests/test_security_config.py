import asyncio
import os
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes.asaas import ASAAS_PLANS, _find_subscription_user_id, asaas_webhook
from services.security_config import LOCAL_CORS_ORIGINS, PRODUCTION_CORS_ORIGINS, parse_cors_origins


class FakeRequest:
    async def json(self):
        return {"event": "IGNORED"}


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
