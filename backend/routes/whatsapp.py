"""
Rotas do Disparador WhatsApp — campanha ativa por usuário.
Armazenamento de fotos via MongoDB GridFS (sem Firebase Storage).
"""
import os
import re
import io
import uuid
import asyncio
import logging
from typing import Optional

import pandas as pd
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from pydantic import BaseModel
import firebase_admin
from firebase_admin import auth as firebase_auth, firestore
from services.public_files import stream_public_gridfs_file
from services.subscription_access import ensure_subscription_access
from services.upload_validation import CSV_CONTENT_TYPES, IMAGE_CONTENT_TYPES, PDF_CONTENT_TYPES, validate_upload

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer(auto_error=False)

COLLECTION = 'whatsapp_campaigns'
MAX_PHOTOS = 20
MAX_TOTAL_BYTES = 50 * 1024 * 1024  # 50 MB

_db = None


def init_whatsapp(database):
    global _db
    _db = database


def _gridfs():
    return AsyncIOMotorGridFSBucket(_db, bucket_name="whatsapp_photos")


async def get_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    if not credentials:
        logger.warning("[SECURITY] auth_missing route=whatsapp")
        raise HTTPException(401, "Token obrigatório")
    try:
        decoded = await asyncio.to_thread(
            firebase_auth.verify_id_token, credentials.credentials
        )
        uid = decoded['uid']
        await ensure_subscription_access(uid)
        return uid
    except HTTPException:
        raise
    except Exception:
        logger.warning("[SECURITY] auth_invalid route=whatsapp")
        raise HTTPException(401, "Token inválido")


def _fs():
    return firestore.client()


def _campaign_ref(uid: str):
    return _fs().collection(COLLECTION).document(uid)


async def _get_campaign(uid: str) -> dict:
    def _read():
        doc = _campaign_ref(uid).get()
        return doc.to_dict() if doc.exists else {}
    return await asyncio.to_thread(_read)


async def _set_campaign(uid: str, data: dict):
    def _write():
        _campaign_ref(uid).set(data, merge=True)
    await asyncio.to_thread(_write)


# ── CSV parsing helpers ───────────────────────────────────────────────────────

_NOME_COLS = ['nome', 'first name', 'name', 'full name', 'nome completo']
_FONE_COLS = ['telefone', 'phone', 'celular', 'whatsapp', 'numero', 'número',
              'phone 1 - value', 'phone1']


def _parse_single_phone(text: str) -> Optional[str]:
    text = text.strip()
    if not text or text.lower() in ('nan', 'none'):
        return None
    # Converte notação científica do Excel (ex: 1.1997501798E+10)
    try:
        text = str(int(float(text)))
    except (ValueError, OverflowError):
        pass
    num = re.sub(r'\D', '', text)
    if not num:
        return None
    if num.startswith('0'):
        num = num[1:]
    if len(num) <= 11:
        num = '55' + num
    return num or None


def normalize_phone(raw: str) -> Optional[str]:
    """Aceita células com múltiplos números separados por :::, retorna o primeiro válido."""
    if not raw or str(raw).strip().lower() in ('', 'nan', 'none'):
        return None
    for part in str(raw).split(':::'):
        result = _parse_single_phone(part)
        if result:
            return result
    return None


def parse_csv_contacts(content: bytes) -> tuple[list[dict], int]:
    df = None
    for enc in ('utf-8-sig', 'utf-8', 'latin1'):
        try:
            df = pd.read_csv(io.BytesIO(content), encoding=enc,
                             sep=None, engine='python', dtype=str)
            break
        except Exception:
            continue
    if df is None:
        raise ValueError("Não foi possível ler o CSV")

    def _best_col(columns, candidates):
        """Retorna a coluna com o candidato mais específico (mais longo) — evita falsos positivos."""
        for cand in sorted(candidates, key=len, reverse=True):
            for col in columns:
                c = col.strip().lower().replace('﻿', '')
                if cand in c:
                    return col
        return None

    col_nome = _best_col(df.columns, _NOME_COLS)
    col_fone = _best_col(df.columns, _FONE_COLS)

    if not col_nome or not col_fone:
        raise ValueError(
            f"CSV precisa de colunas de nome e telefone. "
            f"Colunas encontradas: {list(df.columns)}"
        )


    # Tenta detectar coluna de sobrenome para montar nome completo (Google Contacts)
    col_sobrenome = next((c for c in df.columns if c.strip().lower() in ('last name', 'sobrenome', 'surname')), None)

    contacts, invalidos = [], 0
    for _, row in df.iterrows():
        primeiro = str(row.get(col_nome, '') or '').strip()
        ultimo = str(row.get(col_sobrenome, '') or '').strip() if col_sobrenome else ''
        nome = ' '.join(filter(None, [primeiro, ultimo])) or 'Cliente'
        raw_fone = str(row.get(col_fone, '') or '')
        fone = normalize_phone(raw_fone)
        if not fone:
            invalidos += 1
            continue
        contacts.append({'nome': nome, 'telefone': fone})

    return contacts, invalidos


# ── GridFS photo helpers ──────────────────────────────────────────────────────

async def _upload_photo(filename: str, content: bytes, content_type: str) -> str:
    """Upload photo to MongoDB GridFS, return backend-served URL."""
    if _db is None:
        raise RuntimeError("Banco de dados não inicializado")
    safe = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
    grid_id = await _gridfs().upload_from_stream(
        safe,
        io.BytesIO(content),
        metadata={"content_type": content_type},
    )
    return f"https://api.venpro.com.br/api/whatsapp/fotos/{grid_id}"


async def _delete_photo(url: str):
    """Delete photo from GridFS given its backend URL."""
    try:
        from bson import ObjectId
        grid_id_str = url.split("/fotos/")[-1].split("?")[0]
        await _gridfs().delete(ObjectId(grid_id_str))
    except Exception:
        pass


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/fotos/{grid_id}")
async def servir_foto(grid_id: str):
    """Serve photo from GridFS — public endpoint used by Chrome extension."""
    return await stream_public_gridfs_file(_gridfs(), grid_id, label="Foto")


@router.get("/campanha")
async def get_campanha(uid: str = Depends(get_user_id)):
    camp = await _get_campaign(uid)
    return {
        "contacts_count": len(camp.get("contacts", [])),
        "contacts": camp.get("contacts", []),
        "photoUrls": camp.get("photoUrls", []),
        "message": camp.get("message", ""),
        "sentNumbers": camp.get("sentNumbers", []),
    }


@router.post("/campanha/contatos")
async def upload_contatos(
    arquivo: UploadFile = File(...),
    uid: str = Depends(get_user_id),
):
    content = await arquivo.read()
    validate_upload(
        arquivo,
        content,
        label="Arquivo de contatos",
        allowed_extensions={".csv"},
        allowed_kinds={"text"},
        allowed_content_types=CSV_CONTENT_TYPES,
        max_bytes=5 * 1024 * 1024,
    )
    try:
        contacts, invalidos = await asyncio.to_thread(parse_csv_contacts, content)
    except ValueError as e:
        raise HTTPException(400, str(e))

    await _set_campaign(uid, {"contacts": contacts, "sentNumbers": []})
    return {"total": len(contacts), "invalidos": invalidos}


@router.post("/campanha/fotos")
async def upload_fotos(
    arquivos: list[UploadFile] = File(...),
    uid: str = Depends(get_user_id),
):
    camp = await _get_campaign(uid)
    existing = camp.get("photoUrls", [])

    if len(existing) + len(arquivos) > MAX_PHOTOS:
        raise HTTPException(400, f"Máximo de {MAX_PHOTOS} fotos por campanha")

    total_bytes = 0
    new_urls = []
    for arq in arquivos:
        content = await arq.read()
        validate_upload(
            arq,
            content,
            label="Foto ou PDF",
            allowed_extensions={".jpg", ".jpeg", ".png", ".webp", ".pdf"},
            allowed_kinds={"jpg", "png", "webp", "pdf"},
            allowed_content_types=IMAGE_CONTENT_TYPES | PDF_CONTENT_TYPES,
            max_bytes=10 * 1024 * 1024,
        )
        total_bytes += len(content)
        if total_bytes > MAX_TOTAL_BYTES:
            raise HTTPException(400, "Limite de 50 MB total excedido")
        url = await _upload_photo(arq.filename, content, arq.content_type)
        new_urls.append(url)

    all_urls = existing + new_urls
    await _set_campaign(uid, {"photoUrls": all_urls})
    return {"photoUrls": all_urls}


@router.delete("/campanha/fotos")
async def deletar_fotos(uid: str = Depends(get_user_id)):
    camp = await _get_campaign(uid)
    urls = camp.get("photoUrls", [])
    for url in urls:
        await _delete_photo(url)
    await _set_campaign(uid, {"photoUrls": []})
    return {"deleted": len(urls)}


class MensagemPayload(BaseModel):
    message: str


@router.put("/campanha/mensagem")
async def salvar_mensagem(payload: MensagemPayload, uid: str = Depends(get_user_id)):
    if not payload.message.strip():
        raise HTTPException(400, "Mensagem não pode ser vazia")
    await _set_campaign(uid, {"message": payload.message.strip()})
    return {"ok": True}


class EnviadosPayload(BaseModel):
    telefone: str


@router.post("/campanha/enviados")
async def registrar_enviado(payload: EnviadosPayload, uid: str = Depends(get_user_id)):
    def _append():
        ref = _campaign_ref(uid)
        ref.update({"sentNumbers": firestore.ArrayUnion([payload.telefone])})
    await asyncio.to_thread(_append)
    return {"ok": True}


class IaMensagemPayload(BaseModel):
    descricao: str


@router.post("/campanha/ia-mensagem")
async def sugerir_mensagem_ia(payload: IaMensagemPayload, uid: str = Depends(get_user_id)):
    raise HTTPException(
        410,
        "Sugestão integrada por IA desativada. Use o prompt copiável no painel e cole na IA da sua conta.",
    )
