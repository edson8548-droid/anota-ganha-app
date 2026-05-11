import sys
import os
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.upload_validation import (
    CSV_CONTENT_TYPES,
    IMAGE_CONTENT_TYPES,
    PDF_CONTENT_TYPES,
    safe_filename,
    validate_upload,
)


def _file(filename, content_type):
    return SimpleNamespace(filename=filename, content_type=content_type)


def test_safe_filename_removes_path_parts():
    assert safe_filename("../../clientes.csv") == "clientes.csv"
    assert safe_filename("") == "arquivo"


def test_validate_upload_accepts_csv_text():
    result = validate_upload(
        _file("clientes.csv", "text/csv"),
        b"Nome,Telefone\nJoao,13999001234\n",
        label="Arquivo de contatos",
        allowed_extensions={".csv"},
        allowed_kinds={"text"},
        allowed_content_types=CSV_CONTENT_TYPES,
        max_bytes=1024,
    )

    assert result == "clientes.csv"


def test_validate_upload_rejects_wrong_extension():
    with pytest.raises(HTTPException) as exc:
        validate_upload(
            _file("clientes.exe", "text/csv"),
            b"Nome,Telefone\n",
            label="Arquivo de contatos",
            allowed_extensions={".csv"},
            allowed_kinds={"text"},
            allowed_content_types=CSV_CONTENT_TYPES,
            max_bytes=1024,
        )

    assert exc.value.status_code == 400
    assert "Extensão não permitida" in exc.value.detail


def test_validate_upload_rejects_fake_image_payload():
    with pytest.raises(HTTPException) as exc:
        validate_upload(
            _file("foto.jpg", "image/jpeg"),
            b"nao e imagem",
            label="Foto",
            allowed_extensions={".jpg", ".jpeg", ".png", ".webp"},
            allowed_kinds={"jpg", "png", "webp"},
            allowed_content_types=IMAGE_CONTENT_TYPES,
            max_bytes=1024,
        )

    assert exc.value.status_code == 400
    assert "inválido" in exc.value.detail


def test_validate_upload_accepts_pdf_signature():
    result = validate_upload(
        _file("catalogo.pdf", "application/pdf"),
        b"%PDF-1.7\nconteudo",
        label="Foto ou PDF",
        allowed_extensions={".pdf"},
        allowed_kinds={"pdf"},
        allowed_content_types=PDF_CONTENT_TYPES,
        max_bytes=1024,
    )

    assert result == "catalogo.pdf"
