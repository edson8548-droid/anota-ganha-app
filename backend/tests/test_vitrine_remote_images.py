import asyncio
from types import SimpleNamespace

import pytest
from pymongo.errors import OperationFailure

from routes import vitrine
from routes.vitrine import (
    _extract_simple_delete_token,
    _is_storage_quota_error,
    _preparar_item_vitrine,
    _safe_vitrine_image_url,
    _soft_delete_oferta,
    _stored_vitrine_image_url,
    _validate_remote_image_url,
)


def test_validate_remote_image_url_rejects_non_https():
    with pytest.raises(ValueError):
        _validate_remote_image_url("http://example.com/produto.jpg")


def test_validate_remote_image_url_rejects_localhost():
    with pytest.raises(ValueError):
        _validate_remote_image_url("https://127.0.0.1/produto.jpg")


def test_validate_remote_image_url_rejects_private_host_name():
    with pytest.raises(ValueError):
        _validate_remote_image_url("https://localhost/produto.jpg")


def test_stored_vitrine_image_url_keeps_only_backend_image_path():
    assert (
        _stored_vitrine_image_url("https://api.venpro.com.br/api/vitrine/imagens/abc123")
        == "/api/vitrine/imagens/abc123"
    )
    assert _stored_vitrine_image_url("https://cdn.exemplo.com/produto.jpg") is None


def test_safe_vitrine_image_url_allows_public_https(monkeypatch):
    monkeypatch.setattr("routes.vitrine._is_public_host", lambda hostname: hostname == "cdn.exemplo.com")
    assert _safe_vitrine_image_url("https://cdn.exemplo.com/produto.jpg") == "https://cdn.exemplo.com/produto.jpg"
    assert _safe_vitrine_image_url("http://cdn.exemplo.com/produto.jpg") is None


def test_preparar_item_vitrine_preserves_existing_image_when_not_sent():
    item = _preparar_item_vitrine(
        {
            "id": "item-1",
            "product_name": "Produto",
            "price": 10,
            "unit": "CX",
            "units_per_package": 12,
            "unit_price": 10,
            "image_url": None,
            "sort_order": 0,
            "active": True,
        },
        existing_item={"id": "item-1", "image_url": "/api/vitrine/imagens/abc"},
        sort_order=3,
    )

    assert item["id"] == "item-1"
    assert item["image_url"] == "/api/vitrine/imagens/abc"
    assert item["sort_order"] == 3
    assert item["price"] == 120


def test_extract_simple_delete_token_prefers_query_token():
    assert _extract_simple_delete_token(b"token=body-token", "query-token") == "query-token"


def test_extract_simple_delete_token_accepts_form_body():
    assert _extract_simple_delete_token(b"token=firebase-token") == "firebase-token"


def test_extract_simple_delete_token_accepts_raw_body():
    assert _extract_simple_delete_token(b"firebase-token") == "firebase-token"


def test_storage_quota_error_is_detected():
    exc = OperationFailure(
        "you are over your space quota. Writes are blocked on your cluster.",
        code=8000,
    )

    assert _is_storage_quota_error(exc)


def test_soft_delete_uses_hard_delete_when_storage_quota_blocks_update(monkeypatch):
    offer_id = "000000000000000000000001"

    class FakeOffers:
        def __init__(self):
            self.deleted_filter = None

        async def update_one(self, *_args, **_kwargs):
            raise OperationFailure(
                "you are over your space quota. Writes are blocked on your cluster.",
                code=8000,
            )

        async def delete_one(self, owner_filter):
            self.deleted_filter = owner_filter
            return SimpleNamespace(deleted_count=1)

    fake_offers = FakeOffers()

    async def fake_audit_event(*_args, **_kwargs):
        return None

    monkeypatch.setattr(vitrine, "_db", SimpleNamespace(vitrine_offers=fake_offers))
    monkeypatch.setattr(vitrine, "audit_event", fake_audit_event)

    result = asyncio.run(_soft_delete_oferta(offer_id, "uid-1"))

    assert result == {"ok": True, "hardDeletedDueQuota": True}
    assert str(fake_offers.deleted_filter["_id"]) == offer_id
    assert fake_offers.deleted_filter["created_by"] == "uid-1"
