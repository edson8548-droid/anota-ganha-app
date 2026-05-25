import pytest

from routes.vitrine import _stored_vitrine_image_url, _validate_remote_image_url


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
