# Matching Mais Preciso + Aprendizado por Correções

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir falsos positivos no matching de cotação e acumular aprendizado das correções do usuário via tela de revisão antes do download.

**Architecture:** Fase 1 adiciona entradas em SUBTIPOS_EXCLUSIVOS (travas aditivas, sem tocar no pipeline). Fase 2 adiciona dois endpoints novos em cotacao.py (/preview e /confirmar) + componente ReviewMatches no frontend — sem modificar nenhum endpoint ou função existente.

**Tech Stack:** Python/FastAPI, MongoDB (motor), rapidfuzz, React 18, openpyxl

**CONSTRAINT CRÍTICO:** Nunca alterar a lógica central do `matching_engine.py` (funções `encontrar_preco`, `processar_cotacao`, `processar_cotacao_com_ia`, `nomes_incompativeis_v4`, `_travas_leves`). Só adicionar entradas nas constantes de travas (SUBTIPOS_EXCLUSIVOS, TOKENS_VARIANTE_COMUNS) e alterar o valor de TAXA_SIMILARIDADE.

---

## File Map

| Arquivo | Ação | O que muda |
|---|---|---|
| `backend/services/matching_engine.py` | Modificar | Adicionar grupo dental cream em SUBTIPOS_EXCLUSIVOS; TAXA_SIMILARIDADE 0.75→0.82 |
| `backend/routes/cotacao.py` | Modificar | Adicionar import normalizar_nome; dois novos endpoints /preview e /confirmar |
| `backend/tests/test_matching_travas.py` | Criar | Testes das novas travas |
| `backend/tests/test_cotacao_endpoints.py` | Criar | Testes dos novos endpoints |
| `frontend/src/services/cotacao.service.js` | Modificar | Adicionar previewCotacao e confirmarCotacao |
| `frontend/src/pages/ReviewMatches.js` | Criar | Componente de revisão de matches |
| `frontend/src/pages/Cotacao.js` | Modificar | Integrar fluxo de revisão |

---

## Task 1: Travas de Creme Dental em SUBTIPOS_EXCLUSIVOS

**Files:**
- Modify: `backend/services/matching_engine.py` (linha 19 e bloco SUBTIPOS_EXCLUSIVOS ~linha 131)
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_matching_travas.py`

- [ ] **Step 1: Criar estrutura de testes**

```bash
mkdir -p backend/tests
touch backend/tests/__init__.py
pip install pytest
```

- [ ] **Step 2: Escrever testes que devem falhar**

Criar `backend/tests/test_matching_travas.py`:

```python
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.matching_engine import nomes_incompativeis_v4, normalizar_nome

def _incompat(a, b):
    return nomes_incompativeis_v4(normalizar_nome(a), normalizar_nome(b))

# --- Creme dental: linhas diferentes devem bloquear ---

def test_creme_dental_luminous_vs_mpa():
    assert _incompat(
        "CR DENT COLGATE LUMINOUS WHITE 70G",
        "CR DENT COLGATE MPA A/CARIE 90G"
    ), "LUMINOUS WHITE vs MPA deve ser bloqueado"

def test_creme_dental_nat_vs_mpa():
    assert _incompat(
        "CR DENT COLGATE NAT 90G COCO GENG DETOX",
        "CR DENT COLGATE MPA A/CARIE 90G"
    ), "NAT vs MPA deve ser bloqueado"

def test_creme_dental_total12_vs_mpa():
    assert _incompat(
        "CR DENT COLGATE TOTAL 12 90G WHITE",
        "CR DENT COLGATE MPA A/CARIE 90G"
    ), "TOTAL 12 vs MPA deve ser bloqueado"

def test_creme_dental_neutracucar_vs_total12():
    assert _incompat(
        "CR DENT COLGATE NEUTRACUCAR 70G",
        "CR DENT COLGATE TOTAL 12 90G"
    ), "NEUTRACUCAR vs TOTAL 12 deve ser bloqueado"

def test_creme_dental_sensitive_vs_mpa():
    assert _incompat(
        "CR DENT SENSODYNE SENSITIVE 90G",
        "CR DENT COLGATE MPA A/CARIE 90G"
    ), "SENSITIVE vs MPA deve ser bloqueado"

# --- Regressão: mesma linha deve CONTINUAR casando ---

def test_creme_dental_mesma_linha_nao_bloqueia():
    """MPA vs MPA (mesmo produto) não deve ser bloqueado."""
    assert not _incompat(
        "CR DENT COLGATE MPA A/CARIE 90G",
        "CR DENT COLGATE MPA A CARIE 90G"
    ), "Mesma linha não deve ser bloqueada"

def test_pesos_diferentes_ja_bloqueiam():
    """70G vs 180G já é bloqueado pela trava de peso existente — regressão."""
    assert _incompat(
        "CR DENT COLGATE MPA A/CARIE 180G",
        "CR DENT COLGATE MPA A/CARIE 50G"
    ), "Pesos muito diferentes (50G vs 180G) devem ser bloqueados"
```

- [ ] **Step 3: Rodar testes para confirmar que falham**

```bash
cd backend && python -m pytest tests/test_matching_travas.py -v
```

Resultado esperado: `FAILED` nos 5 primeiros testes de creme dental.

- [ ] **Step 4: Adicionar grupo dental cream ao SUBTIPOS_EXCLUSIVOS**

Em `backend/services/matching_engine.py`, localizar o final do bloco `SUBTIPOS_EXCLUSIVOS` (antes do `]` de fechamento da lista, perto da linha 231):

```python
    # Macarrão instantâneo ≠ massa seca
    {'MAC INS', 'MACAR'},
    # Arroz ≠ feijão
    {'ARROZ', 'FEIJAO'},
    # Arroz — tipos mutuamente exclusivos (PDF)
    {'PARBOILIZADO', 'PARBO'},
    # Feijão — tipos mutuamente exclusivos (PDF)
    {'CARIOCA', 'PRETO', 'FRADINHO', 'JALO', 'BRANCO', 'VERMELHO'},
    # Cerveja — embalagem mutuamente exclusiva (PDF)
    {'LN', 'LONGNECK', 'LONG NECK'},
```

Adicionar APÓS a linha `{'LN', 'LONGNECK', 'LONG NECK'},` e ANTES do `]`:

```python
    # Creme dental — linha/fórmula são produtos diferentes
    # Ex: LUMINOUS WHITE ≠ MPA ≠ TOTAL 12 ≠ NATURAL ≠ NEUTRACUCAR
    {'LUMINOUS WHITE', 'MPA', 'TOTAL 12', 'TOTAL12',
     'NEUTRACUCAR', 'NEUTRAZUCAR', 'NAT',
     'SENSITIVE', 'SENSIVEL', 'TRIPLA', 'HERBAL',
     'WHITENING', 'ANTICARIE', 'MAXFRESH', 'EXTRAFRESH'},
```

- [ ] **Step 5: Alterar TAXA_SIMILARIDADE de 0.75 para 0.82**

Em `backend/services/matching_engine.py`, linha 19:

```python
TAXA_SIMILARIDADE = 0.82  # era 0.75 — reduz falsos positivos na camada 1
```

- [ ] **Step 6: Rodar testes para confirmar que passam**

```bash
cd backend && python -m pytest tests/test_matching_travas.py -v
```

Resultado esperado: todos `PASSED`.

- [ ] **Step 7: Commit**

```bash
git add backend/services/matching_engine.py backend/tests/
git commit -m "fix: travas de creme dental em SUBTIPOS_EXCLUSIVOS + threshold 0.82"
```

---

## Task 2: Backend — Endpoint /preview

**Files:**
- Modify: `backend/routes/cotacao.py`
- Create: `backend/tests/test_cotacao_endpoints.py`

- [ ] **Step 1: Adicionar imports em cotacao.py**

No topo de `backend/routes/cotacao.py`, após os imports existentes:

```python
import uuid
from services.matching_engine import normalizar_nome
```

- [ ] **Step 2: Adicionar helper _resultados_para_preview**

Em `backend/routes/cotacao.py`, após a função `init_cotacao`:

```python
def _resultados_para_preview(itens, resultados):
    """Converte itens + resultados do matching para formato de preview da UI."""
    preview = []
    for item, res in zip(itens, resultados):
        tipo = res.get("tipo")
        if tipo is None:
            status = "sem_match"
            score = None
        elif tipo == "EAN" or tipo == "APRENDIDO":
            status = "aprovado"
            score = 1.0
        else:
            # "SIMILAR 80%" ou "APROX 64%"
            try:
                score = float(tipo.split()[-1].rstrip('%')) / 100
            except (ValueError, IndexError):
                score = 0.0
            status = "pendente"

        preview.append({
            "nome_cotacao": item["nome"],
            "preco": res.get("preco"),
            "tipo": tipo,
            "score": score,
            "status": status,
        })
    return preview
```

- [ ] **Step 3: Adicionar endpoint POST /preview**

Em `backend/routes/cotacao.py`, após o endpoint `processar_cotacao` (após a linha que termina o endpoint `/processar`), adicionar:

```python
@router.post("/preview")
async def preview_cotacao(
    arquivo: UploadFile = File(...),
    tabela_id: str = Form(...),
    modo: str = Form("completo"),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """
    Executa matching e retorna JSON com resultados para revisão.
    Não gera Excel — salva sessão no MongoDB para uso posterior pelo /confirmar.
    """
    from bson import ObjectId
    from services.excel_processor import ler_tabela_mestre, ler_cotacao, processar_arquivo_cotacao
    from services.matching_engine import processar_cotacao_com_ia

    uid = await get_user_id(credentials)

    doc = await db.tabelas_mestre.find_one({"_id": ObjectId(tabela_id), "user_id": uid})
    if not doc:
        raise HTTPException(404, "Tabela mestre não encontrada")

    grid_out = await _bucket().open_download_stream(doc["grid_id"])
    conteudo_mestre = await grid_out.read()

    tmp_mestre = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    tmp_mestre.write(conteudo_mestre)
    tmp_mestre.close()

    conteudo_cotacao = await arquivo.read()
    tmp_cotacao = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    tmp_cotacao.write(conteudo_cotacao)
    tmp_cotacao.close()

    try:
        from services.excel_processor import ler_tabela_mestre, ler_cotacao
        from services.matching_engine import processar_cotacao_com_ia

        prazo = doc.get("prazo", 28)
        precos_dict, precos_lista = ler_tabela_mestre(tmp_mestre.name, prazo=prazo)
        itens, _ = ler_cotacao(tmp_cotacao.name)
        resultados = processar_cotacao_com_ia(itens, precos_dict, precos_lista, modo=modo)

        # Sobrescrever matches com dados aprendidos do usuário
        for i, item in enumerate(itens):
            nome_norm = normalizar_nome(item["nome"])
            learned = await db.cotacao_aprendizado.find_one(
                {"user_id": uid, "produto_cotacao_norm": nome_norm, "confirmado": True}
            )
            if learned:
                resultados[i]["preco"] = learned["preco"]
                resultados[i]["tipo"] = "APRENDIDO"

        preview_items = _resultados_para_preview(itens, resultados)

        # Salvar sessão para uso pelo /confirmar
        session_id = str(uuid.uuid4())
        await db.cotacao_sessoes.insert_one({
            "_id": session_id,
            "user_id": uid,
            "tabela_id": tabela_id,
            "prazo": prazo,
            "cotacao_bytes": conteudo_cotacao,
            "itens": itens,
            "resultados": resultados,
            "created_at": datetime.now(timezone.utc),
        })

    except Exception as e:
        logger.error(f"Erro no preview: {e}")
        raise HTTPException(500, f"Erro ao processar: {str(e)}")
    finally:
        for p in [tmp_mestre.name, tmp_cotacao.name]:
            try:
                os.unlink(p)
            except OSError:
                pass

    return {"session_id": session_id, "itens": preview_items}
```

- [ ] **Step 4: Commit parcial**

```bash
git add backend/routes/cotacao.py
git commit -m "feat: endpoint /preview para revisão de matches antes do download"
```

---

## Task 3: Backend — Endpoint /confirmar + Banco de Aprendizado

**Files:**
- Modify: `backend/routes/cotacao.py`

- [ ] **Step 1: Adicionar endpoint POST /confirmar**

Em `backend/routes/cotacao.py`, após o endpoint `/preview`:

```python
from pydantic import BaseModel
from typing import List

class ConfirmarPayload(BaseModel):
    session_id: str
    aprovacoes: List[bool]  # um bool por item, na mesma ordem do preview


@router.post("/confirmar")
async def confirmar_cotacao(
    payload: ConfirmarPayload,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """
    Recebe aprovações do usuário, salva aprendizado e gera Excel.
    """
    uid = await get_user_id(credentials)

    sessao = await db.cotacao_sessoes.find_one({"_id": payload.session_id, "user_id": uid})
    if not sessao:
        raise HTTPException(404, "Sessão expirada ou não encontrada. Processe a cotação novamente.")

    itens = sessao["itens"]
    resultados = sessao["resultados"]
    cotacao_bytes = sessao["cotacao_bytes"]

    if len(payload.aprovacoes) != len(itens):
        raise HTTPException(400, "Número de aprovações não corresponde ao número de itens.")

    # Salvar aprendizado para itens aprovados que vieram de matching (não EAN)
    agora = datetime.now(timezone.utc)
    for i, aprovado in enumerate(payload.aprovacoes):
        item = itens[i]
        res = resultados[i]
        if res.get("preco") is None:
            continue

        nome_norm = normalizar_nome(item["nome"])
        tipo = res.get("tipo", "")

        if aprovado:
            # Upsert: atualiza se já existe, insere se não existe
            await db.cotacao_aprendizado.update_one(
                {"user_id": uid, "produto_cotacao_norm": nome_norm},
                {"$set": {
                    "preco": res["preco"],
                    "confirmado": True,
                    "updated_at": agora,
                }},
                upsert=True,
            )
        else:
            # Rejeitado: marca como não confirmado para não usar no futuro
            await db.cotacao_aprendizado.update_one(
                {"user_id": uid, "produto_cotacao_norm": nome_norm},
                {"$set": {"confirmado": False, "updated_at": agora}},
                upsert=True,
            )

    # Gerar Excel com apenas items aprovados preenchidos
    resultados_filtrados = []
    for i, res in enumerate(resultados):
        if payload.aprovacoes[i] and res.get("preco") is not None:
            resultados_filtrados.append(res)
        else:
            resultados_filtrados.append({"linha": res.get("linha", 0), "preco": None, "tipo": None})

    try:
        from services.excel_processor import gerar_excel_resultado
        tmp_cotacao = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
        tmp_cotacao.write(cotacao_bytes)
        tmp_cotacao.close()

        caminho_resultado = gerar_excel_resultado(tmp_cotacao.name, itens, resultados_filtrados)
        with open(caminho_resultado, "rb") as f:
            resultado_bytes = f.read()
        os.unlink(caminho_resultado)
    except Exception as e:
        logger.error(f"Erro ao gerar Excel no confirmar: {e}")
        raise HTTPException(500, f"Erro ao gerar Excel: {str(e)}")
    finally:
        try:
            os.unlink(tmp_cotacao.name)
        except OSError:
            pass
        # Limpar sessão após uso
        await db.cotacao_sessoes.delete_one({"_id": payload.session_id})

    # Stats apenas dos aprovados
    stats = {"ean": 0, "descricao": 0, "ia": 0, "aprendido": 0, "sem_match": 0, "total": len(itens)}
    sem_match = []
    for item, res, aprovado in zip(itens, resultados, payload.aprovacoes):
        tipo = res.get("tipo")
        if not aprovado or res.get("preco") is None:
            stats["sem_match"] += 1
            sem_match.append(item["nome"])
        elif tipo == "EAN":
            stats["ean"] += 1
        elif tipo == "APRENDIDO":
            stats["aprendido"] += 1
        elif tipo and "IA" in tipo:
            stats["ia"] += 1
        else:
            stats["descricao"] += 1

    return Response(
        content=resultado_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=cotacao_preenchida.xlsx",
            "X-Stats": json.dumps(stats),
            "X-Sem-Match": json.dumps(sem_match[:50]),
        }
    )
```

- [ ] **Step 2: Criar índice MongoDB para cotacao_aprendizado no startup**

Em `backend/server.py`, dentro de `startup_event`, após `init_cotacao(db)`:

```python
@app.on_event("startup")
async def startup_event():
    logger.info("App started")
    initialize_firebase()
    setup_mercadopago()
    init_cotacao(db)
    # Índice para lookups rápidos de aprendizado
    await db.cotacao_aprendizado.create_index(
        [("user_id", 1), ("produto_cotacao_norm", 1)],
        unique=True
    )
    logger.info("✅ Mercado Pago integrado em /api/mercadopago")
    logger.info("✅ Cotação integrado em /api/cotacao")
```

- [ ] **Step 3: Commit**

```bash
git add backend/routes/cotacao.py backend/server.py
git commit -m "feat: endpoint /confirmar com banco de aprendizado cotacao_aprendizado"
```

---

## Task 4: Frontend — Funções de Serviço

**Files:**
- Modify: `frontend/src/services/cotacao.service.js`

- [ ] **Step 1: Adicionar funções previewCotacao e confirmarCotacao**

Em `frontend/src/services/cotacao.service.js`, adicionar ao final do arquivo:

```javascript
export const previewCotacao = async (arquivo, tabelaId, modo = 'completo') => {
  const formData = new FormData();
  formData.append('arquivo', arquivo);
  formData.append('tabela_id', tabelaId);
  formData.append('modo', modo);

  const response = await api.post('/cotacao/preview', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data; // { session_id, itens }
};

export const confirmarCotacao = async (sessionId, aprovacoes) => {
  const response = await api.post(
    '/cotacao/confirmar',
    { session_id: sessionId, aprovacoes },
    { responseType: 'blob' }
  );

  const statsHeader = response.headers['x-stats'];
  const semMatchHeader = response.headers['x-sem-match'];
  const stats = statsHeader ? JSON.parse(statsHeader) : {};
  const semMatch = semMatchHeader ? JSON.parse(semMatchHeader) : [];

  return { blob: response.data, stats, semMatch };
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/services/cotacao.service.js
git commit -m "feat: funções previewCotacao e confirmarCotacao no service"
```

---

## Task 5: Frontend — Componente ReviewMatches

**Files:**
- Create: `frontend/src/pages/ReviewMatches.js`

- [ ] **Step 1: Criar componente ReviewMatches**

Criar `frontend/src/pages/ReviewMatches.js`:

```javascript
import React, { useState } from 'react';

const BADGE = {
  EAN:       { bg: '#14532d', color: '#4ade80', label: 'EAN ✓' },
  APRENDIDO: { bg: '#1e3a5f', color: '#60a5fa', label: 'Aprendido ✓' },
  pendente:  { bg: '#431407', color: '#fb923c', label: 'Aguarda revisão' },
  sem_match: { bg: '#1e293b', color: '#64748b', label: 'Não encontrado' },
};

function badgeInfo(item) {
  if (item.status === 'aprovado' && item.tipo === 'EAN')       return BADGE.EAN;
  if (item.status === 'aprovado' && item.tipo === 'APRENDIDO') return BADGE.APRENDIDO;
  if (item.status === 'pendente')                               return BADGE.pendente;
  return BADGE.sem_match;
}

export default function ReviewMatches({ itens, onConfirmar, confirmando }) {
  // aprovacoes: array de booleans, mesmo tamanho que itens
  const [aprovacoes, setAprovacoes] = useState(() =>
    itens.map(it => it.status === 'aprovado')
  );

  const toggle = (idx) =>
    setAprovacoes(prev => prev.map((v, i) => i === idx ? !v : v));

  const aprovados = aprovacoes.filter(Boolean).length;
  const total = itens.length;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 16,
      }}>
        <div>
          <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 16 }}>
            Revisar Matches
          </div>
          <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 2 }}>
            {aprovados} de {total} itens aprovados
          </div>
        </div>
        <button
          onClick={() => onConfirmar(aprovacoes)}
          disabled={confirmando || aprovados === 0}
          style={{
            background: confirmando ? '#374151' : '#e8412a',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '10px 20px',
            fontWeight: 700,
            fontSize: 14,
            cursor: confirmando ? 'not-allowed' : 'pointer',
          }}
        >
          {confirmando ? 'Gerando Excel...' : `Confirmar e Baixar (${aprovados})`}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {itens.map((item, idx) => {
          const badge = badgeInfo(item);
          const aprovado = aprovacoes[idx];
          const podeToggle = item.status === 'pendente' || item.status === 'aprovado';

          return (
            <div key={idx} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: aprovado ? '#0f2d1a' : '#1e293b',
              borderRadius: 8,
              padding: '10px 14px',
              border: `1px solid ${aprovado ? '#166534' : '#334155'}`,
              opacity: item.status === 'sem_match' ? 0.55 : 1,
            }}>
              {/* Status badge */}
              <span style={{
                background: badge.bg, color: badge.color,
                borderRadius: 4, padding: '2px 8px', fontSize: 11,
                fontWeight: 700, whiteSpace: 'nowrap', minWidth: 80, textAlign: 'center',
              }}>
                {item.tipo && item.status === 'pendente'
                  ? item.tipo
                  : badge.label}
              </span>

              {/* Nome do produto */}
              <span style={{
                color: '#f1f5f9', fontSize: 13, flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {item.nome_cotacao}
              </span>

              {/* Preço */}
              <span style={{
                color: item.preco ? '#4ade80' : '#64748b',
                fontSize: 13, fontWeight: 700, minWidth: 70, textAlign: 'right',
              }}>
                {item.preco
                  ? `R$ ${Number(item.preco).toFixed(2).replace('.', ',')}`
                  : '—'}
              </span>

              {/* Botão aprovar/rejeitar */}
              {podeToggle && item.preco && (
                <button
                  onClick={() => toggle(idx)}
                  style={{
                    background: aprovado ? '#ef4444' : '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '4px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    minWidth: 70,
                  }}
                >
                  {aprovado ? 'Rejeitar' : 'Aprovar'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/ReviewMatches.js
git commit -m "feat: componente ReviewMatches para revisão de matches antes do download"
```

---

## Task 6: Frontend — Integrar ReviewMatches no Cotacao.js

**Files:**
- Modify: `frontend/src/pages/Cotacao.js`

- [ ] **Step 1: Adicionar imports e novos estados**

No topo de `frontend/src/pages/Cotacao.js`, modificar a linha de imports do service:

```javascript
import { listarTabelas, uploadTabela, excluirTabela, processarCotacao, previewCotacao, confirmarCotacao } from '../services/cotacao.service';
import ReviewMatches from './ReviewMatches';
```

Dentro do componente `Cotacao()`, adicionar novos estados após os existentes:

```javascript
// Review state
const [reviewData, setReviewData] = useState(null);   // { session_id, itens }
const [confirmando, setConfirmando] = useState(false);
```

- [ ] **Step 2: Substituir handleProcessar para chamar preview**

Substituir a função `handleProcessar` existente:

```javascript
const handleProcessar = async () => {
  if (!tabelaSelecionada || !arquivoCotacao) return;
  setProcessing(true);
  setResultado(null);
  setReviewData(null);
  try {
    const data = await previewCotacao(arquivoCotacao, tabelaSelecionada, modoMatch);
    setReviewData(data);
  } catch (err) {
    alert('Erro ao processar: ' + (err.response?.data?.detail || err.message));
  }
  setProcessing(false);
};
```

- [ ] **Step 3: Adicionar handleConfirmar**

Logo após `handleProcessar`, adicionar:

```javascript
const handleConfirmar = async (aprovacoes) => {
  if (!reviewData) return;
  setConfirmando(true);
  try {
    const { blob, stats, semMatch } = await confirmarCotacao(reviewData.session_id, aprovacoes);

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cotacao_preenchida.xlsx';
    a.click();
    window.URL.revokeObjectURL(url);

    setResultado({ stats, semMatch });
    setReviewData(null);
  } catch (err) {
    alert('Erro ao confirmar: ' + (err.response?.data?.detail || err.message));
  }
  setConfirmando(false);
};
```

- [ ] **Step 4: Renderizar ReviewMatches na aba de cotação**

Localizar no JSX de `Cotacao.js` onde `resultado` é renderizado (dentro do tab `cotacao`) e adicionar antes ou após:

```jsx
{reviewData && (
  <ReviewMatches
    itens={reviewData.itens}
    onConfirmar={handleConfirmar}
    confirmando={confirmando}
  />
)}
```

O bloco de `resultado` existente (que mostra stats após download) pode ficar como está — ele aparece após o confirm.

- [ ] **Step 5: Limpar reviewData quando trocar de arquivo**

No handler de seleção do arquivo de cotação (`onChange` do input de cotacao), adicionar `setReviewData(null)`:

```javascript
onChange={e => {
  setArquivoCotacao(e.target.files[0]);
  setReviewData(null);
  setResultado(null);
}}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Cotacao.js
git commit -m "feat: fluxo de revisão de matches antes do download do Excel"
```

---

## Task 7: Deploy e Verificação

- [ ] **Step 1: Build frontend**

```bash
cd frontend && npm run build
```

Resultado esperado: `Compiled successfully.` sem erros.

- [ ] **Step 2: Push para deploy**

```bash
git push origin main
```

- [ ] **Step 3: Verificar deploy no Render**

Aguardar 3-5 minutos. Verificar logs do Render:
- `✅ Firebase Admin SDK inicializado.`
- Sem erros de import nos módulos novos

- [ ] **Step 4: Teste end-to-end**

1. Abrir Robô de Cotação → aba Nova Cotação
2. Selecionar uma tabela + subir arquivo de cotação → clicar Processar
3. Verificar que aparece tela de revisão (não baixa direto)
4. Revisar matches: amarelos mostram porcentagem, verdes aprovados automaticamente
5. Clicar "Confirmar e Baixar" → Excel gerado
6. Processar a mesma cotação de novo → itens aprovados aparecem como "Aprendido ✓" (azul)
