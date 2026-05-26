import pytest

from routes.vitrine import (
    _preparar_item_vitrine,
    _safe_vitrine_image_url,
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
