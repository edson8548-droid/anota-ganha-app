"""Reconhecimento estruturado de produtos baseado em base JSON curada."""

from __future__ import annotations

import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path


DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "product_knowledge.json"


def normalize_text(value):
    """Normaliza texto para matching: ASCII, minusculo, sem pontuacao solta."""
    if value is None:
        return ""
    text = unicodedata.normalize("NFKD", str(value)).encode("ASCII", "ignore").decode("ascii")
    text = text.lower()
    text = text.replace("&", " e ")
    text = re.sub(r"(?<=\d),(?=\d)", ".", text)
    text = re.sub(r"[^a-z0-9.%/]+", " ", text)
    text = text.replace("/", " ")
    text = re.sub(r"\s+", " ", text).strip()
    text = _normalize_units(text)
    text = _normalize_common_aliases(text)
    return text


def _normalize_units(text):
    text = re.sub(r"\b(\d+(?:\.\d+)?)\s*(litros?|lts?|lt)\b", r"\1l", text)
    text = re.sub(r"\b(\d+(?:\.\d+)?)\s*l\b", r"\1l", text)
    text = re.sub(r"\b(\d+(?:\.\d+)?)\s*ml\b", r"\1ml", text)
    text = re.sub(r"\b(\d+(?:\.\d+)?)\s*(gramas?|gr|g)\b", r"\1g", text)
    text = re.sub(r"\b(\d+(?:\.\d+)?)\s*kg\b", r"\1kg", text)
    return re.sub(r"\s+", " ", text).strip()


def _normalize_common_aliases(text):
    replacements = {
        "refresco em po": "ref po",
        "refresco po": "ref po",
        "suco po": "ref po",
        "refr po": "ref po",
        "casa & perfume": "casa perfume",
        "casa e perfume": "casa perfume",
        "ypê": "ype",
        "cha bco": "cha branco",
        "erva doce": "ervadoce",
    }
    for src, dst in replacements.items():
        text = re.sub(r"\b" + re.escape(src) + r"\b", dst, text)
    return text


@lru_cache(maxsize=1)
def load_knowledge(path=None):
    data_path = Path(path) if path else DATA_PATH
    with data_path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def extract_measures(text):
    normalized = normalize_text(text)
    weights = []
    volumes = []
    units = []
    packages = []

    for raw, unit in re.findall(r"\b(\d+(?:\.\d+)?)(kg|g|ml|l)\b", normalized):
        value = _clean_number(raw)
        measure = f"{value}{unit}"
        if unit in {"kg", "g"}:
            weights.append(measure)
        else:
            volumes.append(measure)

    package_aliases = load_knowledge().get("normalization", {}).get("package_aliases", {})
    tokens = set(normalized.split())
    for alias, canonical in package_aliases.items():
        if alias in tokens or canonical in tokens:
            packages.append(canonical)
    if "unidade" in tokens:
        units.append("unidade")

    return {
        "peso": weights[0] if weights else None,
        "volume": volumes[0] if volumes else None,
        "unidade": units[0] if units else None,
        "embalagem": packages[0] if packages else None,
    }


def _clean_number(value):
    if "." not in value:
        return value
    return value.rstrip("0").rstrip(".")


def recognize_product(description, knowledge=None):
    """Retorna reconhecimento estruturado e conservador para uma descricao."""
    data = knowledge or load_knowledge()
    normalized = normalize_text(description)
    tokens = set(normalized.split())
    candidates = []

    for category in data.get("categories", []):
        category_score, category_hits = _score_terms(normalized, category.get("aliases", []))
        brand_matches = []
        attr_matches = []

        for brand in category.get("brands", []):
            brand_score, brand_hits = _score_terms(
                normalized,
                [brand.get("marca", "")] + brand.get("aliases", []) + brand.get("erros_comuns", []),
            )
            if brand_score:
                brand_matches.append((brand_score, brand_hits, brand))
                attr_matches.extend(_match_attributes(normalized, brand, "sabores", "sabor"))
                attr_matches.extend(_match_attributes(normalized, brand, "fragrancias", "fragrancia"))
                attr_matches.extend(_match_plain_values(normalized, brand.get("versoes", []), "linha"))
                attr_matches.extend(_match_plain_values(normalized, brand.get("linhas", []), "linha"))

        generic_fragrances = category.get("generic_fragrancias", [])
        attr_matches.extend(_match_plain_values(normalized, generic_fragrances, "fragrancia", generic=True))

        if not category_score and not brand_matches:
            continue

        best_brand = max(brand_matches, key=lambda item: item[0], default=None)
        score = 0.35 + min(category_score, 0.25)
        if best_brand:
            score += min(best_brand[0], 0.3)
        if attr_matches:
            score += 0.15
        measures = extract_measures(normalized)
        if measures["peso"] or measures["volume"]:
            score += 0.1

        candidates.append({
            "categoria": category.get("categoria"),
            "subcategoria": category.get("subcategoria"),
            "brand": best_brand[2] if best_brand else None,
            "category_hits": category_hits,
            "attributes": attr_matches,
            "score": min(score, 0.98),
            "measures": measures,
            "sources": _collect_sources(category, best_brand[2] if best_brand else None, attr_matches),
        })

    if not candidates:
        measures = extract_measures(normalized)
        return _empty_result(description, normalized, measures)

    candidates.sort(key=lambda item: item["score"], reverse=True)
    best = candidates[0]
    result = _build_result(description, normalized, best)
    if len(candidates) > 1 and candidates[1]["score"] >= best["score"] - 0.08:
        result["alertas"].append("descricao_ambigua")
        result["hipoteses"] = [_candidate_summary(item) for item in candidates[:3]]
        result["confianca"] = min(result["confianca"], 0.78)
    return result


def _score_terms(normalized, terms):
    score = 0.0
    hits = []
    for term in terms:
        term_norm = normalize_text(term)
        if not term_norm:
            continue
        if _contains_phrase(normalized, term_norm):
            hits.append(term_norm)
            score = max(score, 0.25 if " " in term_norm else 0.2)
    return score, hits


def _contains_phrase(normalized, phrase):
    return bool(re.search(r"(^|\s)" + re.escape(phrase) + r"(\s|$)", normalized))


def _match_attributes(normalized, brand, field, output_field):
    matches = []
    for attr in brand.get(field, []):
        aliases = [attr.get("nome", "")] + attr.get("aliases", [])
        hit_score, hits = _score_terms(normalized, aliases)
        if hit_score:
            matches.append({
                "field": output_field,
                "value": attr.get("nome"),
                "hits": hits,
                "confidence": attr.get("confidence", "medium"),
                "sources": attr.get("sources", []),
            })
    return matches


def _match_plain_values(normalized, values, output_field, generic=False):
    matches = []
    for value in values:
        value_norm = normalize_text(value)
        if value_norm and _contains_phrase(normalized, value_norm):
            matches.append({
                "field": output_field,
                "value": value_norm,
                "hits": [value_norm],
                "confidence": "medium" if generic else "high",
                "sources": [],
            })
    return matches


def _collect_sources(category, brand, attributes):
    sources = set()
    if brand:
        sources.update(brand.get("sources", []))
    for attr in attributes:
        sources.update(attr.get("sources", []))
    return sorted(sources)


def _build_result(original, normalized, candidate):
    brand = candidate.get("brand") or {}
    attrs = candidate.get("attributes", [])
    measures = candidate.get("measures", {})
    result = {
        "descricao_original": original,
        "descricao_normalizada": normalized,
        "categoria": candidate.get("categoria"),
        "subcategoria": candidate.get("subcategoria"),
        "marca": brand.get("marca"),
        "linha": _first_attr(attrs, "linha"),
        "nome_comercial": None,
        "sabor": _first_attr(attrs, "sabor"),
        "fragrancia": _first_attr(attrs, "fragrancia"),
        "peso": measures.get("peso"),
        "volume": measures.get("volume"),
        "unidade": measures.get("unidade"),
        "embalagem": measures.get("embalagem"),
        "confianca": round(candidate.get("score", 0.0), 2),
        "fontes": candidate.get("sources", []),
        "alertas": [],
        "hipoteses": [],
    }
    if not result["marca"]:
        result["alertas"].append("marca_nao_identificada")
    if not (result["sabor"] or result["fragrancia"] or result["linha"]):
        result["alertas"].append("variacao_nao_identificada")
    return result


def _first_attr(attributes, field):
    for attr in attributes:
        if attr.get("field") == field:
            return attr.get("value")
    return None


def _candidate_summary(candidate):
    brand = candidate.get("brand") or {}
    return {
        "categoria": candidate.get("categoria"),
        "marca": brand.get("marca"),
        "confianca": round(candidate.get("score", 0.0), 2),
    }


def _empty_result(original, normalized, measures):
    return {
        "descricao_original": original,
        "descricao_normalizada": normalized,
        "categoria": None,
        "subcategoria": None,
        "marca": None,
        "linha": None,
        "nome_comercial": None,
        "sabor": None,
        "fragrancia": None,
        "peso": measures.get("peso"),
        "volume": measures.get("volume"),
        "unidade": measures.get("unidade"),
        "embalagem": measures.get("embalagem"),
        "confianca": 0.0,
        "fontes": [],
        "alertas": ["categoria_nao_identificada", "marca_nao_identificada"],
        "hipoteses": [],
    }
