"""
Vitrine Inteligente Venpro — catálogo B2B por link.
RCA cria oferta, adiciona produtos, gera link público.
Cliente abre, monta pedido e finaliza via WhatsApp.
"""
import os
import re
import io
import uuid
import asyncio
import logging
import unicodedata
from datetime import datetime, timezone
from typing import List, Optional, Any

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from pydantic import BaseModel
from bson import ObjectId
import firebase_admin
from firebase_admin import auth as firebase_auth
from google import genai
from google.genai import types as genai_types

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBearer(auto_error=False)

_db = None
MAX_VITRINES = 3


def init_vitrine(database):
    global _db
    _db = database


def _gridfs():
    return AsyncIOMotorGridFSBucket(_db, bucket_name="vitrine_images")


async def get_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    if not credentials:
        raise HTTPException(401, "Token obrigatório")
    try:
        decoded = await asyncio.to_thread(firebase_auth.verify_id_token, credentials.credentials)
        return decoded["uid"]
    except Exception:
        raise HTTPException(401, "Token inválido")


def normalizar(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = texto.lower().strip()
    texto = re.sub(r"\s+", " ", texto)
    # Padronizar abreviações
    subs = [
        (r"\blt\b", "l"), (r"\blts\b", "l"),
        (r"\bgr\b", "g"), (r"\bgrs\b", "g"),
        (r"\bcx\b", "caixa"), (r"\bun\b", "unidade"),
        (r"\bfd\b", "fardo"), (r"\bpc\b", "paco"),
        (r"\bpct\b", "pacote"), (r"\bkg\b", "kg"),
    ]
    for pat, rep in subs:
        texto = re.sub(pat, rep, texto)
    return texto


def gerar_slug(title: str, uid: str) -> str:
    slug = unicodedata.normalize("NFKD", title)
    slug = "".join(c for c in slug if not unicodedata.combining(c))
    slug = slug.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
    slug = slug[:40]
    suffix = uuid.uuid4().hex[:6]
    return f"{slug}-{suffix}"


def doc_to_dict(doc: dict) -> dict:
    """Converte ObjectId e datetime para string."""
    out = {}
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            out[k] = str(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, list):
            out[k] = [doc_to_dict(i) if isinstance(i, dict) else i for i in v]
        elif isinstance(v, dict):
            out[k] = doc_to_dict(v)
        else:
            out[k] = v
    return out


# ═══════════════════════════════════════
# MODELOS
# ═══════════════════════════════════════

class OfferItem(BaseModel):
    product_name: str
    product_code: Optional[str] = None
    ean: Optional[str] = None
    category: Optional[str] = None
    price: float
    unit: str = "UN"
    units_per_package: Optional[int] = None
    unit_price: Optional[float] = None
    image_url: Optional[str] = None
    sort_order: int = 0
    active: bool = True


class CreateOfferRequest(BaseModel):
    title: str
    company_name: str
    rca_name: str
    rca_whatsapp: str
    minimum_order_value: Optional[float] = None
    expires_at: Optional[str] = None
    notes: Optional[str] = None
    items: Optional[List[OfferItem]] = []


class UpdateOfferRequest(BaseModel):
    title: Optional[str] = None
    company_name: Optional[str] = None
    rca_name: Optional[str] = None
    rca_whatsapp: Optional[str] = None
    minimum_order_value: Optional[float] = None
    expires_at: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class ParseListRequest(BaseModel):
    lista: str


class UpdateItemRequest(BaseModel):
    product_name: Optional[str] = None
    product_code: Optional[str] = None
    ean: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    unit: Optional[str] = None
    units_per_package: Optional[int] = None
    unit_price: Optional[float] = None
    image_url: Optional[str] = None
    sort_order: Optional[int] = None
    active: Optional[bool] = None


# ═══════════════════════════════════════
# PARSE DE LISTA VIA GEMINI
# ═══════════════════════════════════════

async def parse_lista_gemini(lista: str) -> List[dict]:
    prompt = f"""Você é um parser de listas de produtos de representantes comerciais brasileiros.

Analise a lista abaixo e extraia CADA produto com os campos:
- product_name: nome completo do produto (string)
- price: preço numérico sem R$ (float)
- unit: unidade de venda — UN, CX, FD, PC, KG, L, etc. (string, default "UN")
- units_per_package: quantidade de itens por embalagem se mencionado (int ou null)
- ean: código de barras se presente (string ou null)
- category: categoria se mencionável (string ou null)

Retorne APENAS um array JSON válido, sem markdown, sem explicação, sem texto extra.
Exemplo de saída:
[{{"product_name":"Água Sanitária Ypê 2L","price":8.54,"unit":"UN","units_per_package":8,"ean":null,"category":"Limpeza"}}]

Lista para processar:
{lista}"""

    try:
        client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", ""))
        response = await asyncio.to_thread(
            client.models.generate_content,
            model="gemini-2.0-flash",
            contents=prompt,
            config=genai_types.GenerateContentConfig(temperature=0.1, max_output_tokens=4096),
        )
        text = response.text.strip()
        # Remover possíveis blocos markdown
        text = re.sub(r"^```[a-z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
        import json
        items = json.loads(text)
        return items if isinstance(items, list) else []
    except Exception as e:
        logger.error(f"Gemini parse error: {e}")
        return []


# ═══════════════════════════════════════
# ROTAS — PAINEL DO RCA (autenticado)
# ═══════════════════════════════════════

@router.get("/ofertas")
async def listar_ofertas(uid: str = Depends(get_user_id)):
    cursor = _db.vitrine_offers.find(
        {"created_by": uid},
        sort=[("created_at", -1)]
    )
    docs = await cursor.to_list(length=50)
    return [doc_to_dict(d) for d in docs]


@router.post("/ofertas")
async def criar_oferta(req: CreateOfferRequest, uid: str = Depends(get_user_id)):
    count = await _db.vitrine_offers.count_documents({"created_by": uid, "status": {"$ne": "deleted"}})
    if count >= MAX_VITRINES:
        raise HTTPException(400, f"Limite de {MAX_VITRINES} vitrines ativas atingido. Exclua uma para criar outra.")

    slug = gerar_slug(req.title, uid)
    # Garantir slug único
    while await _db.vitrine_offers.find_one({"slug": slug}):
        slug = gerar_slug(req.title, uid)

    items = []
    for i, item in enumerate(req.items or []):
        items.append({
            "id": str(uuid.uuid4()),
            **item.model_dump(),
            "sort_order": i,
            "created_at": datetime.now(timezone.utc),
        })

    doc = {
        "slug": slug,
        "title": req.title,
        "company_name": req.company_name,
        "company_logo_url": None,
        "rca_name": req.rca_name,
        "rca_whatsapp": req.rca_whatsapp,
        "minimum_order_value": req.minimum_order_value,
        "expires_at": req.expires_at,
        "notes": req.notes,
        "status": "active",
        "items": items,
        "created_by": uid,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await _db.vitrine_offers.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc_to_dict(doc)


@router.get("/ofertas/{offer_id}")
async def obter_oferta(offer_id: str, uid: str = Depends(get_user_id)):
    try:
        doc = await _db.vitrine_offers.find_one({"_id": ObjectId(offer_id), "created_by": uid})
    except Exception:
        raise HTTPException(400, "ID inválido")
    if not doc:
        raise HTTPException(404, "Oferta não encontrada")
    return doc_to_dict(doc)


@router.put("/ofertas/{offer_id}")
async def atualizar_oferta(offer_id: str, req: UpdateOfferRequest, uid: str = Depends(get_user_id)):
    try:
        oid = ObjectId(offer_id)
    except Exception:
        raise HTTPException(400, "ID inválido")
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc)
    result = await _db.vitrine_offers.update_one(
        {"_id": oid, "created_by": uid},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Oferta não encontrada")
    doc = await _db.vitrine_offers.find_one({"_id": oid})
    return doc_to_dict(doc)


@router.delete("/ofertas/{offer_id}")
async def excluir_oferta(offer_id: str, uid: str = Depends(get_user_id)):
    try:
        oid = ObjectId(offer_id)
    except Exception:
        raise HTTPException(400, "ID inválido")
    result = await _db.vitrine_offers.update_one(
        {"_id": oid, "created_by": uid},
        {"$set": {"status": "deleted", "updated_at": datetime.now(timezone.utc)}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Oferta não encontrada")
    return {"ok": True}


# ═══════════════════════════════════════
# ITENS DA OFERTA
# ═══════════════════════════════════════

@router.post("/ofertas/{offer_id}/items")
async def adicionar_item(offer_id: str, item: OfferItem, uid: str = Depends(get_user_id)):
    try:
        oid = ObjectId(offer_id)
    except Exception:
        raise HTTPException(400, "ID inválido")
    new_item = {
        "id": str(uuid.uuid4()),
        **item.model_dump(),
        "created_at": datetime.now(timezone.utc),
    }
    result = await _db.vitrine_offers.update_one(
        {"_id": oid, "created_by": uid},
        {"$push": {"items": new_item}, "$set": {"updated_at": datetime.now(timezone.utc)}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Oferta não encontrada")
    return new_item


@router.put("/ofertas/{offer_id}/items/{item_id}")
async def atualizar_item(offer_id: str, item_id: str, req: UpdateItemRequest, uid: str = Depends(get_user_id)):
    try:
        oid = ObjectId(offer_id)
    except Exception:
        raise HTTPException(400, "ID inválido")
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    set_fields = {f"items.$[elem].{k}": v for k, v in updates.items()}
    set_fields["updated_at"] = datetime.now(timezone.utc)
    result = await _db.vitrine_offers.update_one(
        {"_id": oid, "created_by": uid},
        {"$set": set_fields},
        array_filters=[{"elem.id": item_id}]
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Oferta ou item não encontrado")
    return {"ok": True}


@router.delete("/ofertas/{offer_id}/items/{item_id}")
async def remover_item(offer_id: str, item_id: str, uid: str = Depends(get_user_id)):
    try:
        oid = ObjectId(offer_id)
    except Exception:
        raise HTTPException(400, "ID inválido")
    result = await _db.vitrine_offers.update_one(
        {"_id": oid, "created_by": uid},
        {"$pull": {"items": {"id": item_id}}, "$set": {"updated_at": datetime.now(timezone.utc)}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Oferta não encontrada")
    return {"ok": True}


@router.post("/ofertas/{offer_id}/items/reorder")
async def reordenar_items(offer_id: str, order: List[str], uid: str = Depends(get_user_id)):
    """Recebe lista de IDs na nova ordem e atualiza sort_order."""
    try:
        oid = ObjectId(offer_id)
    except Exception:
        raise HTTPException(400, "ID inválido")
    doc = await _db.vitrine_offers.find_one({"_id": oid, "created_by": uid})
    if not doc:
        raise HTTPException(404, "Oferta não encontrada")
    items = doc.get("items", [])
    id_to_idx = {item_id: i for i, item_id in enumerate(order)}
    for item in items:
        if item["id"] in id_to_idx:
            item["sort_order"] = id_to_idx[item["id"]]
    items.sort(key=lambda x: x.get("sort_order", 0))
    await _db.vitrine_offers.update_one(
        {"_id": oid},
        {"$set": {"items": items, "updated_at": datetime.now(timezone.utc)}}
    )
    return {"ok": True}


# ═══════════════════════════════════════
# PARSE DE LISTA DE TEXTO
# ═══════════════════════════════════════

@router.post("/parse-lista")
async def parse_lista(req: ParseListRequest, uid: str = Depends(get_user_id)):
    if not req.lista.strip():
        raise HTTPException(400, "Lista vazia")
    items = await parse_lista_gemini(req.lista)
    if not items:
        raise HTTPException(422, "Não foi possível interpretar a lista. Verifique o formato e tente novamente.")
    return {"items": items, "total": len(items)}


# ═══════════════════════════════════════
# IMAGENS
# ═══════════════════════════════════════

@router.post("/ofertas/{offer_id}/items/{item_id}/imagem")
async def upload_imagem_item(
    offer_id: str,
    item_id: str,
    arquivo: UploadFile = File(...),
    uid: str = Depends(get_user_id),
):
    try:
        oid = ObjectId(offer_id)
    except Exception:
        raise HTTPException(400, "ID inválido")

    # Validar tipo
    if not arquivo.content_type.startswith("image/"):
        raise HTTPException(400, "Apenas imagens são aceitas")

    conteudo = await arquivo.read()
    if len(conteudo) > 5 * 1024 * 1024:
        raise HTTPException(400, "Imagem muito grande — máximo 5 MB")

    # Remover imagem anterior se existir
    doc = await _db.vitrine_offers.find_one({"_id": oid, "created_by": uid})
    if not doc:
        raise HTTPException(404, "Oferta não encontrada")

    for item in doc.get("items", []):
        if item["id"] == item_id and item.get("image_url"):
            old_url = item["image_url"]
            if "/vitrine/imagens/" in old_url:
                old_id = old_url.split("/vitrine/imagens/")[-1]
                try:
                    await _gridfs().delete(ObjectId(old_id))
                except Exception:
                    pass

    # Salvar nova imagem
    grid_id = await _gridfs().upload_from_stream(
        arquivo.filename,
        io.BytesIO(conteudo),
        metadata={"content_type": arquivo.content_type, "offer_id": offer_id, "item_id": item_id},
    )

    image_url = f"/api/vitrine/imagens/{str(grid_id)}"

    # Atualizar item
    await _db.vitrine_offers.update_one(
        {"_id": oid, "created_by": uid},
        {
            "$set": {
                "items.$[elem].image_url": image_url,
                "updated_at": datetime.now(timezone.utc),
            }
        },
        array_filters=[{"elem.id": item_id}],
    )

    # Salvar no banco de imagens para reaproveitamento
    for item in doc.get("items", []):
        if item["id"] == item_id:
            nome_norm = normalizar(item.get("product_name", ""))
            await _db.vitrine_product_images.update_one(
                {"normalized_name": nome_norm},
                {
                    "$set": {
                        "product_name": item.get("product_name"),
                        "normalized_name": nome_norm,
                        "ean": item.get("ean"),
                        "image_url": image_url,
                        "source": "upload",
                        "created_by": uid,
                        "updated_at": datetime.now(timezone.utc),
                    },
                    "$inc": {"selected_count": 1},
                    "$setOnInsert": {"created_at": datetime.now(timezone.utc)},
                },
                upsert=True,
            )
            break

    return {"image_url": image_url}


@router.get("/imagens/{grid_id}")
async def servir_imagem(grid_id: str):
    """Serve imagem pública via GridFS — sem autenticação."""
    try:
        grid_out = await _gridfs().open_download_stream(ObjectId(grid_id))
        content_type = (grid_out.metadata or {}).get("content_type", "image/jpeg")
        return StreamingResponse(grid_out, media_type=content_type)
    except Exception:
        raise HTTPException(404, "Imagem não encontrada")


@router.post("/ofertas/{offer_id}/logo")
async def upload_logo(
    offer_id: str,
    arquivo: UploadFile = File(...),
    uid: str = Depends(get_user_id),
):
    try:
        oid = ObjectId(offer_id)
    except Exception:
        raise HTTPException(400, "ID inválido")
    if not arquivo.content_type.startswith("image/"):
        raise HTTPException(400, "Apenas imagens são aceitas")
    conteudo = await arquivo.read()
    if len(conteudo) > 3 * 1024 * 1024:
        raise HTTPException(400, "Logo muito grande — máximo 3 MB")
    grid_id = await _gridfs().upload_from_stream(
        arquivo.filename,
        io.BytesIO(conteudo),
        metadata={"content_type": arquivo.content_type, "tipo": "logo"},
    )
    logo_url = f"/api/vitrine/imagens/{str(grid_id)}"
    await _db.vitrine_offers.update_one(
        {"_id": oid, "created_by": uid},
        {"$set": {"company_logo_url": logo_url, "updated_at": datetime.now(timezone.utc)}}
    )
    return {"logo_url": logo_url}


GOOGLE_CSE_KEY = "AIzaSyDbevva8TgL4HbmdJY0EhkQaUfgH1ORxQ4"
GOOGLE_CSE_CX  = "a15f97cf882374626"

@router.get("/sugerir-imagem")
async def sugerir_imagem(product_name: str, uid: str = Depends(get_user_id)):
    """Busca imagem: 1) banco interno, 2) Google Custom Search."""
    nome_norm = normalizar(product_name)

    # 1. Banco interno — busca exata
    doc = await _db.vitrine_product_images.find_one({"normalized_name": nome_norm})
    if doc:
        return {"found": True, "image_url": doc["image_url"], "match": "exact"}

    # 2. Banco interno — busca por palavras-chave
    palavras = nome_norm.split()[:3]
    if palavras:
        regex = ".*".join(re.escape(p) for p in palavras)
        doc = await _db.vitrine_product_images.find_one(
            {"normalized_name": {"$regex": regex, "$options": "i"}},
            sort=[("selected_count", -1)]
        )
        if doc:
            return {"found": True, "image_url": doc["image_url"], "match": "similar"}

    # 3. Google Custom Search Images
    try:
        params = {
            "key": GOOGLE_CSE_KEY,
            "cx": GOOGLE_CSE_CX,
            "q": product_name,
            "searchType": "image",
            "num": 1,
            "safe": "active",
            "imgType": "photo",
        }
        resp = requests.get(
            "https://www.googleapis.com/customsearch/v1",
            params=params,
            timeout=5
        )
        if resp.status_code == 200:
            items = resp.json().get("items", [])
            if items:
                image_url = items[0].get("link")
                if image_url:
                    return {"found": True, "image_url": image_url, "match": "google"}
    except Exception:
        pass

    return {"found": False, "image_url": None, "match": None}


# ═══════════════════════════════════════
# ROTA PÚBLICA — sem autenticação
# ═══════════════════════════════════════

@router.get("/publica/{slug}")
async def pagina_publica(slug: str):
    doc = await _db.vitrine_offers.find_one({"slug": slug, "status": "active"})
    if not doc:
        raise HTTPException(404, "Vitrine não encontrada ou inativa")
    result = doc_to_dict(doc)
    # Remover dados internos
    result.pop("created_by", None)
    # Filtrar apenas itens ativos e ordenar
    result["items"] = sorted(
        [i for i in result.get("items", []) if i.get("active", True)],
        key=lambda x: x.get("sort_order", 0)
    )
    return result
