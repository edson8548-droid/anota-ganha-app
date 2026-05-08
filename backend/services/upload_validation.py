from pathlib import Path
from io import BytesIO
from zipfile import BadZipFile, ZipFile

from fastapi import HTTPException, UploadFile


IMAGE_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/webp"}
PDF_CONTENT_TYPES = {"application/pdf", "application/octet-stream"}
XLSX_CONTENT_TYPES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
}
CSV_CONTENT_TYPES = {"text/csv", "application/vnd.ms-excel", "application/octet-stream", "text/plain"}


def safe_filename(filename: str | None, fallback: str = "arquivo") -> str:
    name = Path(filename or fallback).name.strip()
    return name or fallback


def _detected_kind(content: bytes) -> str:
    if content.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return "webp"
    if content.startswith(b"%PDF-"):
        return "pdf"
    if content.startswith((b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")):
        try:
            with ZipFile(BytesIO(content)) as zf:
                names = set(zf.namelist())
                if "[Content_Types].xml" in names and any(name.startswith("xl/") for name in names):
                    return "xlsx"
        except BadZipFile:
            pass
        return "zip"
    if b"\x00" not in content[:4096]:
        return "text"
    return "unknown"


def validate_upload(
    arquivo: UploadFile,
    content: bytes,
    *,
    label: str,
    allowed_extensions: set[str],
    allowed_kinds: set[str],
    allowed_content_types: set[str],
    max_bytes: int,
) -> str:
    filename = safe_filename(arquivo.filename, label)
    extension = Path(filename).suffix.lower()
    content_type = (arquivo.content_type or "").lower()

    if not content:
        raise HTTPException(400, f"{label} vazio.")

    if len(content) > max_bytes:
        max_mb = max_bytes // (1024 * 1024)
        raise HTTPException(400, f"{label} muito grande. Máximo {max_mb} MB.")

    if extension not in allowed_extensions:
        allowed = ", ".join(sorted(allowed_extensions))
        raise HTTPException(400, f"Extensão não permitida para {label}. Use: {allowed}.")

    if content_type and content_type not in allowed_content_types:
        raise HTTPException(400, f"Tipo não permitido para {label}: {content_type}")

    detected = _detected_kind(content)
    if detected not in allowed_kinds:
        raise HTTPException(400, f"{label} inválido ou em formato não suportado.")

    if detected == "text" and extension != ".csv":
        raise HTTPException(400, f"{label} inválido ou em formato não suportado.")

    return filename
