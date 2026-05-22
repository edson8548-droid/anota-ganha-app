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
import requests
from datetime import datetime, timezone, time
from typing import List, Optional, Any

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from pydantic import BaseModel
from bson import ObjectId
import firebase_admin
from firebase_admin import auth as firebase_auth
from services.public_files import stream_public_gridfs_file
from services.security_audit import audit_event
from services.subscription_access import ensure_subscription_access
from services.upload_validation import IMAGE_CONTENT_TYPES, safe_filename, validate_upload

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
        logger.warning("[SECURITY] auth_missing route=vitrine")
        raise HTTPException(401, "Token obrigatório")
    try:
        decoded = await asyncio.to_thread(firebase_auth.verify_id_token, credentials.credentials)
        uid = decoded["uid"]
        await ensure_subscription_access(uid)
        return uid
    except HTTPException:
        raise
    except Exception:
        logger.warning("[SECURITY] auth_invalid route=vitrine")
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


def _parse_public_expiration(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
                return datetime.combine(datetime.fromisoformat(raw).date(), time.max, tzinfo=timezone.utc)
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            logger.warning(f"[vitrine_publica] expires_at inválido ignorado: {raw!r}")
    return None


def _public_offer_response(doc: dict) -> dict:
    result = doc_to_dict(doc)
    items_ativos = [i for i in result.get("items", []) if i.get("active", True)]

    for item in items_ativos:
        _normalizar_precos_vitrine_item(item)

    items_ativos = sorted(items_ativos, key=lambda x: x.get("sort_order", 0))
    item_fields = {
        "id",
        "product_name",
        "category",
        "price",
        "unit",
        "units_per_package",
        "unit_price",
        "image_url",
    }

    return {
        "slug": result.get("slug"),
        "title": result.get("title"),
        "company_name": result.get("company_name"),
        "company_logo_url": result.get("company_logo_url"),
        "rca_name": result.get("rca_name"),
        "rca_whatsapp": result.get("rca_whatsapp"),
        "minimum_order_value": result.get("minimum_order_value"),
        "expires_at": result.get("expires_at"),
        "notes": result.get("notes"),
        "items": [
            {key: item.get(key) for key in item_fields if key in item}
            for item in items_ativos
        ],
    }


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


class LearnImageRequest(BaseModel):
    product_name: str
    image_url: str
    ean: Optional[str] = None
    source: Optional[str] = "manual_select"


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
# PARSE DE LISTA POR CODIGO
# ═══════════════════════════════════════

# Parser Python puro para FORMATO 3 (produto na linha 1, preços na linha 2, separados por linhas em branco)
_F3_PRICE_RE = re.compile(r'^(\d+[,\.]\d+)\s+(\d+[,\.]\d+)')   # "1,45  34.80"  (unitário + total)
_F3_SINGLE_RE = re.compile(r'^(\d+[,\.]\d+)\s*$')               # "1,45"          (só unitário)
_F3_PKG_RE = re.compile(r'\b(CX|FD|SC|TP|PC|PCT|BD|DR|VD|LT|CJ|PT|FRS|PTE|RL|TB|GF|GL|KG|UN|EMB)-(\d+)\s*$', re.IGNORECASE)

# Parser para FORMATO INLINE: "PRODUTO CX-24 2,05" (tudo na mesma linha)
_FI_RE = re.compile(
    r'^(.+?)\s+\b(CX|FD|SC|TP|PC|PCT|BD|DR|VD|LT|CJ|PT|FRS|PTE|RL|TB|GF|GL|KG|UN|EMB)-(\d+)\s+(\d+[,\.]\d+)\s*$',
    re.IGNORECASE
)
_COMPACT_PKG_PRICE_RE = re.compile(
    r'\b(CX|FD|SC|TP|PC|PCT|BD|DR|VD|LT|CJ|PT|FRS|PTE|RL|TB|GF|GL|KG|UN|EMB)\s*-?\s*(\d+)\s*(?:UN)?\s+(\d+[,\.]\d{1,3})\b',
    re.IGNORECASE
)

_CATEGORIAS_KW = {
    'Biscoito': ['bisc'],
    'Laticínio': ['leite', 'iogurte', 'manteiga', 'queijo', 'requeijao', 'nata'],
    'Enlatado': ['sard', 'atum', 'molho', 'extrato'],
    'Bebida': ['cha ', 'cafe', 'suco', 'refri'],
    'Limpeza': ['lava roupa', 'lava loucas', 'sabao', 'deterg', 'cera ', 'inset', 'brilho'],
    'Higiene': ['sabonete', 'shampoo', 'creme dent', 'fio dental', 'desodor'],
    'Mercearia': ['coco', 'oleo', 'vinagre', 'macarr', 'arroz', 'feijao', 'farinha'],
}

def _auto_categoria(nome: str) -> str:
    nl = nome.lower()
    for cat, kws in _CATEGORIAS_KW.items():
        if any(kw in nl for kw in kws):
            return cat
    return 'Mercearia'

def _parse_br_num(s: str) -> float:
    s = s.strip()
    s = s.replace('R$', '').replace(' ', '')
    return float(s.replace(',', '.')) if ',' in s else float(s)

def _is_formato3(lista: str) -> bool:
    linhas = [l.strip() for l in lista.split('\n') if l.strip()]
    if not linhas:
        return False
    price_count = sum(1 for l in linhas if _F3_PRICE_RE.match(l) or _F3_SINGLE_RE.match(l))
    return price_count >= max(1, len(linhas) // 4)

def _parse_formato3(lista: str) -> list:
    items = []
    current = None
    for raw in lista.split('\n'):
        line = raw.strip()
        if not line:
            continue
        pm = _F3_PRICE_RE.match(line)
        sm = None if pm else _F3_SINGLE_RE.match(line)
        if pm or sm:
            if current is not None:
                if pm:
                    current['unit_price'] = _parse_br_num(pm.group(1))
                    current['price'] = _parse_br_num(pm.group(2))
                else:
                    up = _parse_br_num(sm.group(1))
                    upp = current.get('units_per_package')
                    current['unit_price'] = up
                    current['price'] = round(up * upp, 2) if upp else up
                items.append(current)
                current = None
        elif line[0].isalpha():
            if current is not None:
                current.setdefault('unit_price', None)
                current.setdefault('price', 0)
                items.append(current)
            pkg_m = _F3_PKG_RE.search(line)
            if pkg_m:
                unit = pkg_m.group(1).upper()
                upp = int(pkg_m.group(2))
                nome = line[:pkg_m.start()].strip()
            else:
                unit, upp, nome = 'UN', None, line
            current = {
                'product_name': nome,
                'unit': unit,
                'units_per_package': upp,
                'ean': None,
                'category': _auto_categoria(nome),
            }
    if current is not None:
        current.setdefault('unit_price', None)
        current.setdefault('price', 0)
        items.append(current)
    return items


def _is_formato_inline(lista: str) -> bool:
    linhas = [l.strip() for l in lista.split('\n') if l.strip()]
    if not linhas:
        return False
    match_count = sum(1 for l in linhas if _FI_RE.match(l))
    return match_count >= max(1, len(linhas) * 4 // 10)  # 40%+ das linhas batem

def _parse_formato_inline(lista: str) -> list:
    items = []
    for raw in lista.split('\n'):
        line = raw.strip()
        if not line:
            continue
        m = _FI_RE.match(line)
        if m:
            nome = m.group(1).strip()
            unit = m.group(2).upper()
            upp = int(m.group(3))
            unit_price = _parse_br_num(m.group(4))
            items.append({
                'product_name': nome,
                'unit': unit,
                'units_per_package': upp,
                'unit_price': unit_price,
                'price': round(unit_price * upp, 2),
                'ean': None,
                'category': _auto_categoria(nome),
            })
        elif line[0].isalpha():  # linha sem preço: aceita com price=0
            pkg_m = _F3_PKG_RE.search(line)
            if pkg_m:
                nome = line[:pkg_m.start()].strip()
                unit, upp = pkg_m.group(1).upper(), int(pkg_m.group(2))
            else:
                nome, unit, upp = line, 'UN', None
            items.append({'product_name': nome, 'unit': unit, 'units_per_package': upp,
                          'unit_price': None, 'price': 0, 'ean': None, 'category': _auto_categoria(nome)})
    return items


def _limpar_cabecalho_lista_compacta(nome: str) -> str:
    nome = nome.strip()
    nome = re.sub(r'^\s*Nome\s+do\s+Produto\s+Quantidade\s+da\s+Embalagem\s+Preço\s+Unitário\s*(?:\(R\$\))?\s*', '', nome, flags=re.IGNORECASE)
    nome = re.sub(r'^\s*Nome\s*do\s*Produto\s*Quantidade\s*da\s*Embalagem\s*Preço\s*Unitário\s*(?:\(R\$\))?\s*', '', nome, flags=re.IGNORECASE)
    nome = re.sub(r'^\s*Produto\s+Embalagem\s+Preço\s*', '', nome, flags=re.IGNORECASE)
    return nome.strip(' -;|\t')


def _is_formato_compacto(lista: str) -> bool:
    texto = re.sub(r'\s+', ' ', lista or '').strip()
    if not texto:
        return False
    matches = list(_COMPACT_PKG_PRICE_RE.finditer(texto))
    if len(matches) >= 2:
        return True
    return len(matches) == 1 and '\n' not in texto and len(texto) > 20


def _parse_formato_compacto(lista: str) -> list:
    texto = re.sub(r'\s+', ' ', lista or '').strip()
    items = []
    matches = list(_COMPACT_PKG_PRICE_RE.finditer(texto))
    start = 0

    for idx, match in enumerate(matches):
        nome = texto[start:match.start()].strip()
        nome = _limpar_cabecalho_lista_compacta(nome)
        start = match.end()

        if not nome or not re.search(r'[A-Za-zÀ-ÿΑ-ω]', nome):
            continue

        unit = match.group(1).upper()
        upp = int(match.group(2))
        unit_price = _parse_br_num(match.group(3))
        items.append({
            'product_name': nome,
            'unit': unit,
            'units_per_package': upp,
            'unit_price': unit_price,
            'price': round(unit_price * upp, 2),
            'ean': None,
            'category': _auto_categoria(nome),
        })

    return items


def _parse_formato_csv(lista: str) -> list:
    linhas = [l.strip() for l in lista.split('\n') if l.strip()]
    if not linhas or not any(';' in l for l in linhas):
        return []

    items = []
    header = None
    for line in linhas:
        cols = [c.strip() for c in line.split(';')]
        lowered = [normalizar(c) for c in cols]

        if any(c in ('produto', 'product_name', 'nome') for c in lowered):
            header = lowered
            continue

        if len(cols) < 2:
            continue

        nome = cols[0]
        if not nome or not re.search(r'[A-Za-zÀ-ÿ]', nome):
            continue

        unit_price = None
        price = 0
        unit = 'UN'
        units_per_package = None

        if header:
            def col_value(*names):
                names_norm = [normalizar(name) for name in names]
                for idx, col in enumerate(header):
                    if any(col == name or name in col for name in names_norm):
                        if idx < len(cols):
                            return cols[idx]
                return ''

            nome = col_value('produto', 'nome do produto', 'product_name', 'nome') or nome
            unit_price_raw = col_value('preco unitario', 'r$ unitario', 'unitario', 'preco_unitario')
            price_raw = col_value('preco caixa', 'preco embalagem', 'r$ emb.', 'r$ emb', 'preco_embalagem')
            emb_raw = col_value('quantidade da embalagem', 'qtd embalagem', 'qtd por embalagem', 'embalagem', 'emb.', 'emb')
            if not price_raw:
                price_raw = unit_price_raw
        else:
            # Quando não há header, assume formato: Produto;CX-QTD;PREÇO
            # ou Produto;CX-QTD;PREÇO_UNITÁRIO;PREÇO_CAIXA
            unit_price_raw = None
            price_raw = None
            emb_raw = None

            if len(cols) == 2:
                unit_price_raw = cols[1]
                price_raw = cols[1]
                emb_raw = next((c for c in cols if _F3_PKG_RE.search(c)), '')
            elif len(cols) == 3:
                unit_price_raw = cols[2]
                price_raw = cols[2]
                emb_raw = cols[1]
            elif len(cols) >= 4:
                # Formato: Produto;CX-QTD;PREÇO_UNITÁRIO;PREÇO_CAIXA (com mais campos)
                unit_price_raw = cols[2]
                price_raw = cols[3]
                emb_raw = cols[1]
            else:
                # Formato inválido, pular
                continue

        try:
            if unit_price_raw and re.search(r'\d', unit_price_raw):
                unit_price = _parse_br_num(unit_price_raw)
        except Exception:
            unit_price = None

        try:
            if price_raw and re.search(r'\d', price_raw):
                price = _parse_br_num(price_raw)
        except Exception:
            price = 0

        pkg_m = _F3_PKG_RE.search(emb_raw or nome)
        if pkg_m:
            unit = pkg_m.group(1).upper()
            units_per_package = int(pkg_m.group(2))
            if emb_raw and not header:
                nome = _F3_PKG_RE.sub('', nome).strip()

        items.append({
            'product_name': nome,
            'unit': unit,
            'units_per_package': units_per_package,
            'unit_price': unit_price,
            'price': price,
            'ean': None,
            'category': _auto_categoria(nome),
        })

    return items


def _parse_formato_livre(lista: str) -> list:
    items = []
    price_re = re.compile(r'(?:R\$\s*)?(\d+[,.]\d{1,3})')
    pkg_any_re = re.compile(r'\b(CX|FD|SC|TP|PC|PCT|BD|DR|VD|LT|CJ|PT|FRS|PTE|RL|TB|GF|GL|KG|UN|EMB)\s*-?\s*(\d+)?\s*(?:UN)?\b', re.IGNORECASE)

    for raw in lista.split('\n'):
        line = raw.strip()
        if not line or not re.search(r'[A-Za-zÀ-ÿ]', line):
            continue

        if ';' in line:
            continue

        ean_m = re.search(r'\b\d{13}\b', line)
        ean = ean_m.group(0) if ean_m else None

        price_matches = list(price_re.finditer(line))
        unit_price = None
        price = 0
        if price_matches:
            try:
                price = _parse_br_num(price_matches[-1].group(1))
            except Exception:
                price = 0
            if len(price_matches) > 1:
                try:
                    unit_price = _parse_br_num(price_matches[0].group(1))
                except Exception:
                    unit_price = None

        unit = 'UN'
        units_per_package = None
        pkg_matches = list(pkg_any_re.finditer(line))
        if pkg_matches:
            pkg = pkg_matches[-1]
            unit = pkg.group(1).upper()
            if pkg.group(2):
                units_per_package = int(pkg.group(2))

        nome = line
        if price_matches:
            nome = nome[:price_matches[0].start()].strip()
        nome = re.sub(r'\b\d{13}\b', '', nome).strip()
        nome = _F3_PKG_RE.sub('', nome).strip()
        nome = re.sub(r'\s+', ' ', nome)

        if not nome:
            continue

        if unit_price is not None and units_per_package and price == unit_price:
            price = round(unit_price * units_per_package, 2)

        items.append({
            'product_name': nome,
            'unit': unit,
            'units_per_package': units_per_package,
            'unit_price': unit_price,
            'price': price,
            'ean': ean,
            'category': _auto_categoria(nome),
        })

    return items


def _normalizar_precos_vitrine_item(item: dict) -> dict:
    """
    Na Vitrine, o preço digitado pelo RCA representa o preço unitário.
    O preço da caixa/embalagem fica separado em `price` para cálculo de subtotal.
    """
    units = item.get("units_per_package") or None
    try:
        units = int(units) if units else None
    except Exception:
        units = None

    raw_unit = item.get("unit_price")
    raw_price = item.get("price")
    unit_price = None

    try:
        if raw_unit is not None and raw_unit != 0:
            unit_price = float(raw_unit)
        elif raw_price is not None:
            unit_price = float(raw_price)
    except Exception:
        unit_price = 0

    if unit_price is None:
        unit_price = 0

    item["unit_price"] = round(unit_price, 3)
    item["price"] = round(unit_price * units, 2) if units else round(unit_price, 2)
    return item


async def parse_lista_codigo(lista: str) -> List[dict]:
    # Lista colada de IA/Excel/PDF sem quebras de linha:
    # "Produto CX-24 2,05 Produto 2 CX-12 4,90 ..."
    if _is_formato_compacto(lista):
        result = _parse_formato_compacto(lista)
        if result:
            logger.info(f"[parse_lista] FORMATO_COMPACTO Python: {len(result)} produtos")
            return result

    # Fast path: formato inline — "PRODUTO CX-24 2,05" (tudo na mesma linha)
    if _is_formato_inline(lista):
        result = _parse_formato_inline(lista)
        if result:
            logger.info(f"[parse_lista] FORMATO_INLINE Python: {len(result)} produtos")
            return result

    # Fast path: parser Python puro para FORMATO 3 (determinístico, mais confiável que Gemini)
    if _is_formato3(lista):
        result = _parse_formato3(lista)
        if result:
            logger.info(f"[parse_lista] FORMATO3 Python: {len(result)} produtos")
            return result

    result = _parse_formato_csv(lista)
    if result:
        logger.info(f"[parse_lista] CSV Python: {len(result)} produtos")
        return result

    result = _parse_formato_livre(lista)
    if result:
        logger.info(f"[parse_lista] TEXTO_LIVRE Python: {len(result)} produtos")
        return result

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

    result = []
    for doc in docs:
        oferta_dict = doc_to_dict(doc)

        for item in oferta_dict.get("items", []):
            _normalizar_precos_vitrine_item(item)

        result.append(oferta_dict)

    return result


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
        item_dict = item.model_dump()

        logger.info(f"[CRIAR_OFERTA] Item {i}: {item_dict}")
        _normalizar_precos_vitrine_item(item_dict)

        items.append({
            "id": str(uuid.uuid4()),
            **item_dict,
            "sort_order": i,
            "created_at": datetime.now(timezone.utc),
        })

    logger.info(f"[CRIAR_OFERTA] Total de itens: {len(items)}")

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
    await audit_event(
        "vitrine_offer_created",
        uid=uid,
        status="success",
        metadata={"offerId": str(result.inserted_id), "items": len(items), "status": doc["status"]},
    )
    return doc_to_dict(doc)


@router.get("/ofertas/{offer_id}")
async def obter_oferta(offer_id: str, uid: str = Depends(get_user_id)):
    try:
        doc = await _db.vitrine_offers.find_one({"_id": ObjectId(offer_id), "created_by": uid})
    except Exception:
        raise HTTPException(400, "ID inválido")
    if not doc:
        raise HTTPException(404, "Oferta não encontrada")

    result = doc_to_dict(doc)

    for item in result.get("items", []):
        _normalizar_precos_vitrine_item(item)

    return result


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
    await audit_event(
        "vitrine_offer_updated",
        uid=uid,
        status="success",
        metadata={"offerId": offer_id, "fields": sorted(k for k in updates.keys() if k != "updated_at")},
    )
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
    await audit_event("vitrine_offer_deleted", uid=uid, status="success", metadata={"offerId": offer_id})
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

    item_dict = item.model_dump()

    _normalizar_precos_vitrine_item(item_dict)

    new_item = {
        "id": str(uuid.uuid4()),
        **item_dict,
        "created_at": datetime.now(timezone.utc),
    }
    result = await _db.vitrine_offers.update_one(
        {"_id": oid, "created_by": uid},
        {"$push": {"items": new_item}, "$set": {"updated_at": datetime.now(timezone.utc)}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Oferta não encontrada")
    await audit_event(
        "vitrine_item_created",
        uid=uid,
        status="success",
        metadata={"offerId": offer_id, "itemId": new_item["id"]},
    )
    return new_item


@router.put("/ofertas/{offer_id}/items/{item_id}")
async def atualizar_item(offer_id: str, item_id: str, req: UpdateItemRequest, uid: str = Depends(get_user_id)):
    try:
        oid = ObjectId(offer_id)
    except Exception:
        raise HTTPException(400, "ID inválido")

    # Buscar o item atual primeiro
    doc = await _db.vitrine_offers.find_one({"_id": oid, "created_by": uid})
    if not doc:
        raise HTTPException(404, "Oferta não encontrada")

    item_atual = None
    for item in doc.get("items", []):
        if item.get("id") == item_id:
            item_atual = item
            break

    if not item_atual:
        raise HTTPException(404, "Item não encontrado")

    updates = {k: v for k, v in req.model_dump().items() if v is not None}

    if "price" in updates or "unit_price" in updates or "units_per_package" in updates:
        merged = {**item_atual, **updates}
        _normalizar_precos_vitrine_item(merged)
        updates["price"] = merged["price"]
        updates["unit_price"] = merged["unit_price"]
        updates["units_per_package"] = merged.get("units_per_package")

    set_fields = {f"items.$[elem].{k}": v for k, v in updates.items()}
    set_fields["updated_at"] = datetime.now(timezone.utc)
    result = await _db.vitrine_offers.update_one(
        {"_id": oid, "created_by": uid},
        {"$set": set_fields},
        array_filters=[{"elem.id": item_id}]
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Oferta ou item não encontrado")
    await audit_event(
        "vitrine_item_updated",
        uid=uid,
        status="success",
        metadata={"offerId": offer_id, "itemId": item_id, "fields": sorted(updates.keys())},
    )
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
    await audit_event(
        "vitrine_item_deleted",
        uid=uid,
        status="success",
        metadata={"offerId": offer_id, "itemId": item_id},
    )
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
    await audit_event(
        "vitrine_items_reordered",
        uid=uid,
        status="success",
        metadata={"offerId": offer_id, "items": len(order)},
    )
    return {"ok": True}


# ═══════════════════════════════════════
# PARSE DE LISTA DE TEXTO
# ═══════════════════════════════════════

@router.post("/parse-lista")
async def parse_lista(req: ParseListRequest, uid: str = Depends(get_user_id)):
    if not req.lista.strip():
        raise HTTPException(400, "Lista vazia")
    items = await parse_lista_codigo(req.lista)
    if not items:
        raise HTTPException(422, "Não foi possível interpretar a lista. Verifique o formato e tente novamente.")
    await audit_event("vitrine_list_parsed", uid=uid, status="success", metadata={"items": len(items)})
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

    conteudo = await arquivo.read()
    filename = validate_upload(
        arquivo,
        conteudo,
        label="Imagem",
        allowed_extensions={".jpg", ".jpeg", ".png", ".webp"},
        allowed_kinds={"jpg", "png", "webp"},
        allowed_content_types=IMAGE_CONTENT_TYPES,
        max_bytes=5 * 1024 * 1024,
    )

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
        safe_filename(filename, "produto.jpg"),
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

    await audit_event(
        "vitrine_item_image_uploaded",
        uid=uid,
        status="success",
        metadata={"offerId": offer_id, "itemId": item_id, "bytes": len(conteudo)},
    )
    return {"image_url": image_url}


@router.get("/imagens/{grid_id}")
async def servir_imagem(grid_id: str):
    """Serve imagem pública via GridFS — sem autenticação."""
    return await stream_public_gridfs_file(_gridfs(), grid_id, label="Imagem")


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
    conteudo = await arquivo.read()
    filename = validate_upload(
        arquivo,
        conteudo,
        label="Logo",
        allowed_extensions={".jpg", ".jpeg", ".png", ".webp"},
        allowed_kinds={"jpg", "png", "webp"},
        allowed_content_types=IMAGE_CONTENT_TYPES,
        max_bytes=3 * 1024 * 1024,
    )
    grid_id = await _gridfs().upload_from_stream(
        safe_filename(filename, "logo.jpg"),
        io.BytesIO(conteudo),
        metadata={"content_type": arquivo.content_type, "tipo": "logo"},
    )
    logo_url = f"/api/vitrine/imagens/{str(grid_id)}"
    await _db.vitrine_offers.update_one(
        {"_id": oid, "created_by": uid},
        {"$set": {"company_logo_url": logo_url, "updated_at": datetime.now(timezone.utc)}}
    )
    await audit_event(
        "vitrine_logo_uploaded",
        uid=uid,
        status="success",
        metadata={"offerId": offer_id, "bytes": len(conteudo)},
    )
    return {"logo_url": logo_url}


SERPER_API_KEY = os.environ.get("SERPER_API_KEY", "").strip()


def _image_score(img: dict) -> int:
    url = img.get("imageUrl") or img.get("thumbnailUrl") or ""
    width = int(img.get("imageWidth") or img.get("width") or 0)
    height = int(img.get("imageHeight") or img.get("height") or 0)
    score = 0
    if img.get("imageUrl"):
        score += 100
    if width and height:
        score += min(width * height // 10000, 120)
        if width >= 500 and height >= 500:
            score += 60
        if width < 250 or height < 250:
            score -= 80
    if "thumb" in url.lower():
        score -= 30
    return score


def _serper_images(product_name: str, limit: int = 6) -> dict:
    """Busca opções de imagem no Serper.dev e retorna a melhor + alternativas."""
    if not SERPER_API_KEY:
        logger.warning("[Serper] SERPER_API_KEY não configurada")
        return {"found": False, "image_url": None, "match": None, "images": []}

    try:
        resp = requests.post(
            "https://google.serper.dev/images",
            headers={"X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json"},
            json={"q": f"{product_name} produto", "gl": "br", "hl": "pt", "num": 10},
            timeout=10,
        )
        logger.info(f"[Serper] status={resp.status_code} query={product_name!r}")
        if resp.status_code != 200:
            logger.error(f"[Serper] status={resp.status_code} body={resp.text[:300]}")
            return {"found": False, "image_url": None, "match": None, "images": []}

        raw_images = resp.json().get("images", [])
        logger.info(f"[Serper] images received: {len(raw_images)}")
        candidates = []
        seen = set()
        for img in raw_images:
            url = img.get("imageUrl") or img.get("thumbnailUrl") or ""
            if not url or url in seen or url.lower().endswith(".svg"):
                continue
            seen.add(url)
            candidates.append({
                "image_url": url,
                "thumbnail_url": img.get("thumbnailUrl") or url,
                "width": img.get("imageWidth") or img.get("width"),
                "height": img.get("imageHeight") or img.get("height"),
                "source": "serper",
                "_score": _image_score(img),
            })

        candidates.sort(key=lambda item: item["_score"], reverse=True)
        images = [{k: v for k, v in item.items() if k != "_score"} for item in candidates[:limit]]
        if not images:
            logger.warning(f"[Serper] no valid imageUrl in {len(raw_images)} results")
            return {"found": False, "image_url": None, "match": None, "images": []}

        return {"found": True, "image_url": images[0]["image_url"], "match": "serper", "images": images}
    except Exception as e:
        logger.error(f"[Serper] exception: {e}")
        return {"found": False, "image_url": None, "match": None, "images": []}


def _serper_search(product_name: str) -> dict:
    """Busca síncrona no Serper.dev — chamada via asyncio.to_thread()."""
    result = _serper_images(product_name, limit=1)
    return {"found": result["found"], "image_url": result["image_url"], "match": result["match"]}


async def _find_learned_image(nome_norm: str, uid: str) -> Optional[dict]:
    if not nome_norm:
        return None

    # Preferência do próprio RCA primeiro. Se não houver, usa a base compartilhada.
    doc = await _db.vitrine_product_images.find_one(
        {"normalized_name": nome_norm, "created_by": uid},
        sort=[("selected_count", -1), ("updated_at", -1)],
    )
    if doc:
        return doc

    return await _db.vitrine_product_images.find_one(
        {"normalized_name": nome_norm, "created_by": {"$ne": uid}},
        sort=[("selected_count", -1), ("updated_at", -1)],
    )


@router.get("/sugerir-imagem")
async def sugerir_imagem(product_name: str, uid: str = Depends(get_user_id)):
    """Busca imagem: 1) banco interno, 2) Serper.dev (Google Images)."""
    nome_norm = normalizar(product_name)
    logger.info(f"[sugerir-imagem] query={product_name!r} norm={nome_norm!r}")

    # 1. Banco interno — busca exata
    doc = await _find_learned_image(nome_norm, uid)
    if doc:
        url = doc.get("image_url")
        if url:
            return {"found": True, "image_url": url, "match": "exact"}

    # 2. Banco interno — busca por palavras-chave
    palavras = nome_norm.split()[:3]
    if palavras:
        regex = ".*".join(re.escape(p) for p in palavras)
        doc = await _db.vitrine_product_images.find_one(
            {"normalized_name": {"$regex": regex, "$options": "i"}, "created_by": uid},
            sort=[("selected_count", -1), ("updated_at", -1)],
        )
        if not doc:
            doc = await _db.vitrine_product_images.find_one(
                {"normalized_name": {"$regex": regex, "$options": "i"}, "created_by": {"$ne": uid}},
                sort=[("selected_count", -1), ("updated_at", -1)],
            )
        if doc:
            url = doc.get("image_url")
            if url:
                return {"found": True, "image_url": url, "match": "similar"}

    # 3. Serper.dev — Google Images (via thread para não bloquear event loop)
    result = await asyncio.to_thread(_serper_search, product_name)
    if result.get("found") and result.get("image_url"):
        await _db.vitrine_product_images.update_one(
            {"normalized_name": nome_norm},
            {
                "$set": {
                    "product_name": product_name,
                    "normalized_name": nome_norm,
                    "image_url": result["image_url"],
                    "source": result.get("match") or "serper",
                    "updated_at": datetime.now(timezone.utc),
                },
                "$inc": {"selected_count": 1},
                "$setOnInsert": {"created_at": datetime.now(timezone.utc)},
            },
            upsert=True,
        )
    return result


@router.post("/aprender-imagem")
async def aprender_imagem(req: LearnImageRequest, uid: str = Depends(get_user_id)):
    product_name = (req.product_name or "").strip()
    image_url = (req.image_url or "").strip()
    if not product_name:
        raise HTTPException(400, "Nome do produto obrigatório")
    if not image_url:
        raise HTTPException(400, "URL da imagem obrigatória")
    if not (
        image_url.startswith("https://")
        or image_url.startswith("http://")
        or image_url.startswith("/api/vitrine/imagens/")
    ):
        raise HTTPException(400, "URL da imagem inválida")

    nome_norm = normalizar(product_name)
    now = datetime.now(timezone.utc)
    await _db.vitrine_product_images.update_one(
        {"normalized_name": nome_norm, "created_by": uid},
        {
            "$set": {
                "product_name": product_name,
                "normalized_name": nome_norm,
                "ean": req.ean,
                "image_url": image_url,
                "source": req.source or "manual_select",
                "created_by": uid,
                "updated_at": now,
                "preferred": True,
            },
            "$inc": {"selected_count": 1},
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    await audit_event(
        "vitrine_item_image_learned",
        uid=uid,
        status="success",
        metadata={"productName": product_name[:120], "source": req.source or "manual_select"},
    )
    return {"ok": True, "image_url": image_url, "match": "learned"}


@router.get("/sugerir-imagens")
async def sugerir_imagens(product_name: str, uid: str = Depends(get_user_id)):
    """Retorna até 6 opções da internet para o RCA escolher outra foto."""
    if not product_name.strip():
        raise HTTPException(400, "Nome do produto obrigatório")
    result = await asyncio.to_thread(_serper_images, product_name, 6)
    return result


# ═══════════════════════════════════════
# ROTA PÚBLICA — sem autenticação
# ═══════════════════════════════════════

@router.get("/publica/{slug}")
async def pagina_publica(slug: str):
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{2,80}", slug):
        logger.warning("[SECURITY] vitrine_public_blocked reason=bad_slug slug_len=%s", len(slug or ""))
        raise HTTPException(404, "Vitrine não encontrada ou inativa")

    doc = await _db.vitrine_offers.find_one({"slug": slug, "status": "active"})
    if not doc:
        logger.warning("[SECURITY] vitrine_public_blocked reason=not_found_or_inactive slug_len=%s", len(slug or ""))
        raise HTTPException(404, "Vitrine não encontrada ou inativa")

    expires_at = _parse_public_expiration(doc.get("expires_at"))
    if expires_at and datetime.now(timezone.utc) > expires_at:
        logger.warning("[SECURITY] vitrine_public_blocked reason=expired slug_len=%s", len(slug or ""))
        raise HTTPException(410, "Vitrine expirada")

    return _public_offer_response(doc)
