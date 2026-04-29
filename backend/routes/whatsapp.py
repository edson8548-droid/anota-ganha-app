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
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from pydantic import BaseModel
import firebase_admin
from firebase_admin import auth as firebase_auth, firestore

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
        raise HTTPException(401, "Token obrigatório")
    try:
        decoded = await asyncio.to_thread(
            firebase_auth.verify_id_token, credentials.credentials
        )
        return decoded['uid']
    except Exception:
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


def normalize_phone(raw: str) -> Optional[str]:
    if not raw or str(raw).strip().lower() in ('', 'nan', 'none'):
        return None
    text = str(raw).split(':::')[-1].strip()
    # Converte notação científica do Excel (ex: 1.1997501798E+10 → "11997501798")
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
    return num if len(num) >= 12 else None


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

    def _match(col: str, candidates: list) -> bool:
        c = col.strip().lower().replace('﻿', '')
        return any(cand in c for cand in candidates)

    col_nome = next((c for c in df.columns if _match(c, _NOME_COLS)), None)
    col_fone = next((c for c in df.columns if _match(c, _FONE_COLS)), None)

    if not col_nome or not col_fone:
        raise ValueError(
            f"CSV precisa de colunas de nome e telefone. "
            f"Colunas encontradas: {list(df.columns)}"
        )

    contacts, invalidos = [], 0
    for _, row in df.iterrows():
        nome = str(row.get(col_nome, '') or '').strip() or 'Cliente'
        fone = normalize_phone(str(row.get(col_fone, '') or ''))
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
    from bson import ObjectId
    try:
        grid_out = await _gridfs().open_download_stream(ObjectId(grid_id))
        content_type = (grid_out.metadata or {}).get("content_type", "image/jpeg")
        return StreamingResponse(grid_out, media_type=content_type)
    except Exception:
        raise HTTPException(404, "Foto não encontrada")


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
        total_bytes += len(content)
        if total_bytes > MAX_TOTAL_BYTES:
            raise HTTPException(400, "Limite de 50 MB total excedido")
        allowed = ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
        if arq.content_type not in allowed:
            raise HTTPException(400, f"Tipo não permitido: {arq.content_type}")
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


from google import genai as _genai
from google.genai import types as _genai_types

_IA_PROMPT = """Você é o Assistente Venpro, especializado em representação comercial no Brasil.
Crie um texto de oferta direto e impactante para WhatsApp de representante comercial.

REGRAS OBRIGATÓRIAS:
- NÃO inclua saudação — o robô já adiciona "Bom dia/tarde, [NOME]!" automaticamente.
- Comece já na oferta, sem enrolação.
- Use APENAS as informações que o usuário forneceu. Nunca invente preços, prazos ou links.
- Se o usuário mencionou um link/URL, inclua-o literalmente no texto. Nunca substitua por [LINK] ou similar.
- Se faltam informações (preço, prazo), escreva o texto sem elas — não use placeholders.
- Máximo 5 linhas. Português brasileiro informal.
- Emojis: no máximo 3, só se ficarem naturais."""


class IaMensagemPayload(BaseModel):
    descricao: str


@router.post("/campanha/ia-mensagem")
async def sugerir_mensagem_ia(payload: IaMensagemPayload, uid: str = Depends(get_user_id)):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(500, "GEMINI_API_KEY não configurada")

    def _generate():
        client = _genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=payload.descricao,
            config=_genai_types.GenerateContentConfig(
                system_instruction=_IA_PROMPT,
            ),
        )
        return response.text

    texto = await asyncio.to_thread(_generate)
    return {"sugestao": texto}
