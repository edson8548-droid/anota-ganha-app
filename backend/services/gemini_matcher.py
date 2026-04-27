"""
Camada 4 — Matching via Gemini 1.5 Flash.
Recebe itens sem match e a lista de produtos da tabela mestre,
pede ao Gemini para encontrar correspondências.
"""

import os
import json
import logging
import google.generativeai as genai

logger = logging.getLogger(__name__)

PROMPT_TEMPLATE = """Você é um motor de matching de produtos alimentares, higiene e limpeza.

O representante comercial enviou uma cotação com produtos que NÃO foram encontrados automaticamente.
Abaixo está a lista de produtos BUSCADOS (sem match) e a lista de produtos DISPONÍVEIS na tabela mestre.

Sua tarefa: para cada produto buscado, encontre o melhor correspondente na tabela mestre.
Considere variações de nome, marca, embalagem (LT vs SC, CX vs PK, etc.) e peso/volume.

REGRAS IMPORTANTES:
- Só faça match se tiver confiança >= 70%. Se não tiver, retorne null.
- Produtos de categorias diferentes NUNCA devem ser combinados (ex: achocolatado com achocolatado em pó é ok, achocolatado com café NÃO).
- Respeite marca: produto buscado com marca específica só pode combinar com mesma marca.
- Respeite embalagem: LT (lata) não combina com SC (sachê), CX não combina com PK.
- Se houver múltiplas opções similares, escolha a de maior similaridade textual.

PRODUTOS BUSCADOS (sem match):
{buscados}

PRODUTOS DISPONÍVEIS NA TABELA MESTRE:
{disponiveis}

Responda APENAS com JSON válido, no formato:
{{
  "matches": [
    {{ "buscado_idx": 0, "disponivel_idx": 42, "confianca": 85 }},
    {{ "buscado_idx": 3, "disponivel_idx": 107, "confianca": 72 }}
  ]
}}

Não inclua explicação, apenas o JSON."""


def _chunk_list(lst, size):
    for i in range(0, len(lst), size):
        yield lst[i:i + size]


def _build_buscados(itens_sem_match):
    lines = []
    for i, item in enumerate(itens_sem_match):
        ean = item.get("ean", "")
        ean_str = f" (EAN: {ean})" if ean else ""
        lines.append(f'[{i}] "{item["nome"]}"{ean_str}')
    return "\n".join(lines)


def _filtrar_candidatos(chunk, precos_nome_lista, max_n=150):
    """
    Retorna subconjunto de precos_nome_lista mais relevante para o chunk.
    Usa overlap de palavras para reduzir de ~1000+ para ~150 candidatos,
    diminuindo drasticamente o tamanho do prompt e o tempo de resposta do Gemini.
    """
    query_words = set()
    for item in chunk:
        for w in item["nome"].upper().split():
            if len(w) >= 4:
                query_words.add(w)

    scored = []
    for i, p in enumerate(precos_nome_lista):
        nome_up = p["orig"].upper()
        score = sum(1 for w in query_words if w in nome_up)
        scored.append((score, i, p))

    scored.sort(key=lambda x: -x[0])
    # Garantir ao menos max_n candidatos (mesmo com score 0)
    top = scored[:max_n]
    return [(orig_i, p) for _, orig_i, p in top]


def _build_disponiveis_filtrado(candidatos_indexados):
    lines = []
    for display_idx, (_, item) in enumerate(candidatos_indexados):
        lines.append(f'[{display_idx}] "{item["orig"]}" -> R$ {item["preco"]:.2f}')
    return "\n".join(lines)


def gemini_match_batch(itens_sem_match, precos_nome_lista, max_items=50):
    """
    Usa Gemini para tentar match dos itens que o motor de regras não encontrou.
    Pre-filtra os candidatos da tabela para ~150 mais relevantes por chunk,
    reduzindo o tamanho do prompt de ~20k para ~3k tokens por chamada.

    Returns:
        dict {idx_original: (preco, "IA CONFIANCA%")} para matches encontrados
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY não configurada — camada IA desativada")
        return {}

    if not itens_sem_match or not precos_nome_lista:
        return {}

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name="gemini-2.5-flash-lite")

    matches = {}

    for chunk in _chunk_list(itens_sem_match, max_items):
        try:
            candidatos_indexados = _filtrar_candidatos(chunk, precos_nome_lista, max_n=150)

            prompt = PROMPT_TEMPLATE.format(
                buscados=_build_buscados(chunk),
                disponiveis=_build_disponiveis_filtrado(candidatos_indexados),
            )

            response = model.generate_content(prompt)
            text = response.text.strip()

            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
                text = text.strip()

            data = json.loads(text)
            raw_matches = data.get("matches", [])

            for m in raw_matches:
                b_idx = m.get("buscado_idx")
                d_idx = m.get("disponivel_idx")  # display_idx no subconjunto filtrado
                conf = m.get("confianca", 0)

                if b_idx is None or d_idx is None or conf < 70:
                    continue
                if b_idx >= len(chunk) or d_idx >= len(candidatos_indexados):
                    continue

                item_buscado = chunk[b_idx]
                orig_idx, item_disponivel = candidatos_indexados[d_idx]
                matches[item_buscado["idx_original"]] = (
                    item_disponivel["preco"],
                    f"IA {int(conf)}%",
                )

        except json.JSONDecodeError as e:
            logger.warning(f"Gemini retornou JSON inválido: {e}")
        except Exception as e:
            logger.error(f"Erro na chamada Gemini: {e}")

    return matches
