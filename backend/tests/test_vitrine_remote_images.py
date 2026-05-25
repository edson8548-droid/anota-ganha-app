import pytest

from routes.vitrine import _validate_remote_image_url


def test_validate_remote_image_url_rejects_non_https():
    with pytest.raises(ValueError):
        _validate_remote_image_url("http://example.com/produto.jpg")


def test_validate_remote_image_url_rejects_localhost():
    with pytest.raises(ValueError):
        _validate_remote_image_url("https://127.0.0.1/produto.jpg")


def test_validate_remote_image_url_rejects_private_host_name():
    with pytest.raises(ValueError):
        _validate_remote_image_url("https://localhost/produto.jpg")
