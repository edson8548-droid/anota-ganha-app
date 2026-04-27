# Robo de Cotacao no Site Venpro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar o robo de cotacao para o site Venpro, com cadastro de tabelas mestre (ate 5) e processamento hibrido (EAN + descricao + IA).

**Architecture:** Backend FastAPI recebe upload de tabelas e cotacoes, usa motor de matching extraido do robo local (3 camadas + Gemini), devolve Excel preenchido. Frontend React com pagina dedicada de Cotacao.

**Tech Stack:** FastAPI, MongoDB GridFS, React, Tailwind/Radix, rapidfuzz, openpyxl, google-generativeai

---

## File Structure

```
backend/
  services/
    matching_engine.py    # Motor de matching extraido (normalizacao + 3 camadas + EAN)
    excel_processor.py    # Leitura de Excel (cotacao + tabela mestre) + geracao resultado
  routes/
    cotacao.py           # Endpoints: CRUD tabelas + processar cotacao
frontend/src/
  pages/
    Cotacao.js           # Pagina com abas Minhas Tabelas + Nova Cotacao
  services/
    cotacao.service.js   # API calls para /api/cotacao/*
```

---

### Task 1: Extrair motor de matching para modulo independente

**Files:**
- Create: `backend/services/matching_engine.py`
- Source: `/home/edson/Área de trabalho/robo_cotacao_local/local_bot/robo_cotacao.py`

- [ ] **Step 1: Criar backend/services/ e matching_engine.py com todas as constantes**

Copiar do robo_cotacao.py (linhas 1-300): imports, MARCAS_POR_CATEGORIA, SUBTIPOS_EXCLUSIVOS, TOKENS_VARIANTE_COMUNS, TOKENS_VARIANTE_DESCARTAR, TOKENS_VARIANTE_FORTES, TAMANHOS_FRALDA.

Remover imports de playwright e asyncio. Manter: pandas, rapidfuzz/thefuzz, re, unicodedata.

Adicionar funcao independente `limpar_ean(ean)` (sem self).

- [ ] **Step 2: Adicionar funcao normalizar_nome(nome) standalone**

Extrair de robo_cotacao.py linha 335-785. Converter para funcao standalone (sem self). Manter toda a logica v5.0.

- [ ] **Step 3: Adicionar funcoes auxiliares**

Extrair sem self:
- `ordenar_palavras(nome)` — linha 787
- `_obter_prefixo_categoria(nome_normalizado)` — linha 795
- `_extrair_categoria(nome_normalizado)` — linha 1520
- `_extrair_marca(nome_normalizado)` — linha 1529

- [ ] **Step 4: Adicionar funcoes de travas**

Extrair sem self:
- `nomes_incompativeis_v4(nome1, nome2)` — linha 821-1135
- `_travas_leves(nome1, nome2)` — linha 1347-1518

- [ ] **Step 5: Adicionar motor de matching principal**

Extrair sem self:
- `_candidatos_rapidos(n_site, n_site_ord, precos_nome_lista, norms_cache)` — linha 1228
- `encontrar_preco(ean, nome_original, precos_dict, precos_nome_lista, norms_cache)` — linha 1242

Retorna `(preco, tipo_match)` onde tipo_match e "EAN", "SIMILAR X%", "APROX X%".

- [ ] **Step 6: Adicionar funcao de processamento em lote**

```python
def processar_cotacao(itens_cotacao, precos_dict, precos_nome_lista, modo="completo"):
    """
    itens_cotacao: lista de {"ean": str, "nome": str, "linha": int}
    precos_dict: dict ean->preco
    precos_nome_lista: lista de {"norm", "ord", "preco", "orig"}
    modo: "ean" ou "completo"

    Retorna: lista de {"linha": int, "preco": float|None, "tipo": str|None}
    """
    results = []
    norms_cache = [item['norm'] for item in precos_nome_lista]

    for item in itens_cotacao:
        if modo == "ean":
            # So EAN
            ean_limpo = limpar_ean(item['ean'])
            preco = precos_dict.get(ean_limpo) if ean_limpo else None
            tipo = "EAN" if preco else None
            results.append({"linha": item['linha'], "preco": preco, "tipo": tipo})
        else:
            # Completo: EAN + 3 camadas
            preco, tipo = encontrar_preco(
                item['ean'], item['nome'],
                precos_dict, precos_nome_lista, norms_cache
            )
            results.append({"linha": item['linha'], "preco": preco, "tipo": tipo})

    return results
```

- [ ] **Step 7: Testar modulo standalone**

Criar teste rapido que carrega precos.xlsx e roda matching nela mesma (deve dar ~100%):
```bash
cd /home/edson/Área\ de\ trabalho/anota-ganha-app/backend
python -c "from services.matching_engine import *; print('imports OK')"
```

---

### Task 2: Criar modulo de leitura de Excel

**Files:**
- Create: `backend/services/excel_processor.py`

- [ ] **Step 1: Criar excel_processor.py com funcao de leitura de tabela mestre**

```python
import pandas as pd
from .matching_engine import limpar_ean, normalizar_nome, ordenar_palavras

def ler_tabela_mestre(caminho_arquivo, header_row=2, col_nome=0, col_ean=1, prazo=28):
    """
    Le Excel de tabela de precos mestre.
    Retorna: (precos_dict, precos_nome_lista)
    - precos_dict: {ean_str: preco_float}
    - precos_nome_lista: [{"norm", "ord", "preco", "orig"}]
    """
    df = pd.read_excel(caminho_arquivo, header=header_row)

    # Achar coluna de preco pelo prazo
    col_preco = None
    for col in df.columns:
        if str(prazo) in str(col).replace(" dias", "").replace(" DIAS", ""):
            col_preco = col
            break
    if not col_preco:
        col_preco = df.columns[-1]

    precos = {}
    precos_nome_lista = []

    for _, row in df.iterrows():
        ean = limpar_ean(row.iloc[col_ean_idx])
        nome_bruto = str(row.iloc[col_nome_idx])
        try:
            preco = float(row[col_preco])
            if ean:
                precos[ean] = preco

            nome_norm = normalizar_nome(nome_bruto)
            precos_nome_lista.append({
                'norm': nome_norm,
                'ord': ordenar_palavras(nome_norm),
                'preco': preco,
                'orig': nome_bruto
            })
        except:
            continue

    return precos, precos_nome_lista
```

- [ ] **Step 2: Adicionar funcao de leitura de cotacao**

```python
def ler_cotacao(caminho_arquivo):
    """
    Le Excel de cotacao (anexo 2) que o RCA sobe.
    Retorna: lista de {"ean": str, "nome": str, "linha": int, "col_ean": int, "col_nome": int, "col_preco": int}
    Detecta automaticamente as colunas de EAN, nome e preco.
    """
    wb = openpyxl.load_workbook(caminho_arquivo)
    ws = wb.active

    # Detectar colunas (procurar header com EAN, Produto, Preco, etc)
    col_ean = None
    col_nome = None
    col_preco = None
    header_row = None

    for row_idx, row in enumerate(ws.iter_rows(max_row=10), 1):
        for cell in row:
            val = str(cell.value).upper().strip() if cell.value else ""
            if val in ("EAN", "COD.BARRAS", "COD BARRAS", "CÓDIGO", "CODIGO", "COD. BARRAS"):
                col_ean = cell.column - 1
                col_nome = col_nome or (cell.column - 1 + 1)  # geralmente proxima coluna
                header_row = row_idx
            elif val in ("PRODUTO", "DESCRIÇÃO", "DESCRICAO", "ITEM", "DESCRIÇÃO DO PRODUTO"):
                col_nome = cell.column - 1
                header_row = row_idx
            elif val in ("PREÇO", "PRECO", "VALOR UNITÁRIO", "VALOR", "R$"):
                col_preco = cell.column - 1
                header_row = row_idx

    if not header_row:
        # Fallback: assume coluna 0=nome, 1=ean, ultima=preco, header na linha 1
        header_row = 1
        col_nome = 0
        col_ean = 1
        col_preco = ws.max_column - 1

    # Extrair itens
    itens = []
    for row_idx, row in enumerate(ws.iter_rows(min_row=header_row + 1), header_row + 1):
        ean_val = row[col_ean].value if col_ean is not None else None
        nome_val = row[col_nome].value if col_nome is not None else None

        if nome_val and str(nome_val).strip():
            itens.append({
                "ean": str(ean_val) if ean_val else "",
                "nome": str(nome_val),
                "linha": row_idx,
                "col_ean": col_ean,
                "col_nome": col_nome,
                "col_preco": col_preco,
            })

    return itens, header_row, caminho_arquivo
```

- [ ] **Step 3: Adicionar funcao de geracao do Excel resultado**

```python
from openpyxl.styles import PatternFill
import tempfile
import os

PREENCHIMENTO_IA = PatternFill(start_color="FFFF00", end_color="FFFF00", fill_type="solid")  # amarelo

def gerar_excel_resultado(caminho_original, itens_cotacao, resultados):
    """
    Recebe o Excel original + resultados do matching.
    Gera novo Excel com precos preenchidos.
    Itens matched por IA ficam em amarelo.
    Retorna caminho do arquivo gerado.
    """
    from openpyxl import load_workbook

    wb = load_workbook(caminho_original)
    ws = wb.active

    for item, res in zip(itens_cotacao, resultados):
        if res["preco"] is not None:
            col = item["col_preco"]
            ws.cell(row=item["linha"], column=col + 1).value = res["preco"]

            # Marcar IA em amarelo
            if res["tipo"] and "IA" in res["tipo"]:
                ws.cell(row=item["linha"], column=col + 1).fill = PREENCHIMENTO_IA

    # Salvar em temp
    output = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    wb.save(output.name)
    output.close()
    return output.name
```

---

### Task 3: Criar backend route /api/cotacao

**Files:**
- Create: `backend/routes/cotacao.py`
- Modify: `backend/server.py` (registrar novo route)

- [ ] **Step 1: Criar cotacao.py com CRUD de tabelas mestre**

```python
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
import firebase_admin
from firebase_admin import auth as firebase_auth
import gridfs
import os
from datetime import datetime
from io import BytesIO

router = APIRouter()
security = HTTPBearer(auto_error=False)

# MongoDB
db = None
fs = None

def init_cotacao(database):
    global db, fs
    db = database
    fs = gridfs.GridFS(db)

async def get_user_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    if not credentials:
        raise HTTPException(401, "Token obrigatório")
    try:
        decoded = firebase_auth.verify_id_token(credentials.credentials)
        return decoded['uid']
    except Exception:
        raise HTTPException(401, "Token inválido")

MAX_TABELAS = 5

@router.post("/tabelas")
async def upload_tabela(
    arquivo: UploadFile = File(...),
    nome: str = Form(...),
    prazo: int = Form(28),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    uid = await get_user_id(credentials)

    # Verificar limite
    collection = db.tabelas_mestre
    count = await collection.count_documents({"user_id": uid})
    if count >= MAX_TABELAS:
        raise HTTPException(400, f"Máximo de {MAX_TABELAS} tabelas permitidas")

    # Salvar arquivo no GridFS
    conteudo = await arquivo.read()
    grid_id = fs.put(conteudo, filename=arquivo.filename, content_type=arquivo.content_type)

    # Contar produtos
    from services.excel_processor import ler_tabela_mestre
    import tempfile
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    tmp.write(conteudo)
    tmp.close()

    try:
        precos_dict, precos_lista = ler_tabela_mestre(tmp.name, prazo=prazo)
        qtd = len(precos_lista)
    except Exception as e:
        os.unlink(tmp.name)
        fs.delete(grid_id)
        raise HTTPException(400, f"Erro ao ler tabela: {str(e)}")
    os.unlink(tmp.name)

    doc = {
        "user_id": uid,
        "nome": nome,
        "filename": arquivo.filename,
        "grid_id": grid_id,
        "prazo": prazo,
        "qtd_produtos": qtd,
        "data_upload": datetime.utcnow(),
    }
    result = await collection.insert_one(doc)

    return {
        "id": str(result.inserted_id),
        "nome": nome,
        "qtd_produtos": qtd,
        "data_upload": doc["data_upload"].isoformat(),
    }

@router.get("/tabelas")
async def listar_tabelas(credentials: HTTPAuthorizationCredentials = Depends(security)):
    uid = await get_user_id(credentials)
    collection = db.tabelas_mestre
    tabelas = []
    async for doc in collection.find({"user_id": uid}).sort("data_upload", -1):
        tabelas.append({
            "id": str(doc["_id"]),
            "nome": doc["nome"],
            "filename": doc["filename"],
            "qtd_produtos": doc["qtd_produtos"],
            "prazo": doc.get("prazo", 28),
            "data_upload": doc["data_upload"].isoformat(),
        })
    return tabelas

@router.put("/tabelas/{tabela_id}")
async def renomear_tabela(
    tabela_id: str,
    nome: str = Form(...),
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    from bson import ObjectId
    uid = await get_user_id(credentials)
    result = await db.tabelas_mestre.update_one(
        {"_id": ObjectId(tabela_id), "user_id": uid},
        {"$set": {"nome": nome}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Tabela não encontrada")
    return {"ok": True}

@router.delete("/tabelas/{tabela_id}")
async def excluir_tabela(
    tabela_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    from bson import ObjectId
    uid = await get_user_id(credentials)
    doc = await db.tabelas_mestre.find_one({"_id": ObjectId(tabela_id), "user_id": uid})
    if not doc:
        raise HTTPException(404, "Tabela não encontrada")
    fs.delete(doc["grid_id"])
    await db.tabelas_mestre.delete_one({"_id": ObjectId(tabela_id)})
    return {"ok": True}
```

- [ ] **Step 2: Adicionar endpoint de processamento**

```python
@router.post("/processar")
async def processar_cotacao(
    arquivo: UploadFile = File(...),
    tabela_id: str = Form(...),
    modo: str = Form("completo"),  # "ean" ou "completo"
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    from bson import ObjectId
    from services.excel_processor import ler_tabela_mestre, ler_cotacao, gerar_excel_resultado
    from services.matching_engine import processar_cotacao as motor_processar
    import tempfile

    uid = await get_user_id(credentials)

    # Buscar tabela mestre
    doc = await db.tabelas_mestre.find_one({"_id": ObjectId(tabela_id), "user_id": uid})
    if not doc:
        raise HTTPException(404, "Tabela mestre não encontrada")

    # Baixar tabela mestre do GridFS
    grid_file = fs.get(doc["grid_id"])
    conteudo_mestre = grid_file.read()
    tmp_mestre = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    tmp_mestre.write(conteudo_mestre)
    tmp_mestre.close()

    # Salvar cotacao upload
    conteudo_cotacao = await arquivo.read()
    tmp_cotacao = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    tmp_cotacao.write(conteudo_cotacao)
    tmp_cotacao.close()

    try:
        # Carregar dados
        precos_dict, precos_lista = ler_tabela_mestre(tmp_mestre.name, prazo=doc.get("prazo", 28))
        itens_cotacao, _, _ = ler_cotacao(tmp_cotacao.name)

        # Processar matching
        resultados = motor_processar(itens_cotacao, precos_dict, precos_lista, modo=modo)

        # Gerar Excel resultado
        caminho_resultado = gerar_excel_resultado(tmp_cotacao.name, itens_cotacao, resultados)

        # Ler resultado para enviar
        with open(caminho_resultado, "rb") as f:
            resultado_bytes = f.read()

        # Estatisticas
        stats = {"ean": 0, "descricao": 0, "ia": 0, "sem_match": 0, "total": len(resultados)}
        for r in resultados:
            if r["tipo"] is None:
                stats["sem_match"] += 1
            elif r["tipo"] == "EAN":
                stats["ean"] += 1
            elif "IA" in (r["tipo"] or ""):
                stats["ia"] += 1
            else:
                stats["descricao"] += 1

        # Limpar temp files
        os.unlink(tmp_mestre.name)
        os.unlink(tmp_cotacao.name)
        os.unlink(caminho_resultado)

    except Exception as e:
        os.unlink(tmp_mestre.name)
        os.unlink(tmp_cotacao.name)
        raise HTTPException(500, f"Erro ao processar: {str(e)}")

    from fastapi.responses import Response
    return Response(
        content=resultado_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=cotacao_preenchida.xlsx",
            "X-Stats": json.dumps(stats),
        }
    )
```

- [ ] **Step 3: Registrar route no server.py**

Em `backend/server.py`, adicionar:
```python
from routes.cotacao import router as cotacao_router, init_cotacao
```
E depois dos outros routers:
```python
app.include_router(cotacao_router, prefix="/api/cotacao", tags=["Cotação"])
init_cotacao(db)
```

---

### Task 4: Criar frontend — pagina Cotacao.js

**Files:**
- Create: `frontend/src/pages/Cotacao.js`
- Create: `frontend/src/services/cotacao.service.js`
- Modify: `frontend/src/App.js` (adicionar rota)

- [ ] **Step 1: Criar cotacao.service.js**

```javascript
import api from './api';

const API_URL = "https://api.venpro.com.br";

export const listarTabelas = () => api.get('/cotacao/tabelas');

export const uploadTabela = (arquivo, nome, prazo = 28) => {
  const formData = new FormData();
  formData.append('arquivo', arquivo);
  formData.append('nome', nome);
  formData.append('prazo', prazo);
  return api.post('/cotacao/tabelas', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const renomearTabela = (id, nome) => {
  const formData = new FormData();
  formData.append('nome', nome);
  return api.put(`/cotacao/tabelas/${id}`, formData);
};

export const excluirTabela = (id) => api.delete(`/cotacao/tabelas/${id}`);

export const processarCotacao = (arquivo, tabelaId, modo = 'completo') => {
  const formData = new FormData();
  formData.append('arquivo', arquivo);
  formData.append('tabela_id', tabelaId);
  formData.append('modo', modo);
  return api.post('/cotacao/processar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    responseType: 'blob',
  });
};
```

- [ ] **Step 2: Criar Cotacao.js — estrutura base com abas**

Pagina com 2 abas (Minhas Tabelas / Nova Cotacao), usando Tailwind CSS seguindo o padrao das paginas existentes (Dashboard.js, AssistenteIA.js).

Aba "Minhas Tabelas":
- Lista cards com nome, qtd produtos, data
- Botao "Adicionar Tabela" (modal com nome + upload)
- Botoes por card: renomear, excluir

Aba "Nova Cotacao":
- Select de tabela mestre
- Radio: EAN apenas / Completo
- Upload cotacao (drag-and-drop)
- Botao Processar
- Resultado: stats + botao download

- [ ] **Step 3: Adicionar rota em App.js**

```javascript
import Cotacao from './pages/Cotacao';
// Na seção de rotas:
<Route path="/cotacao" element={<ProtectedRoute><Cotacao /></ProtectedRoute>} />
```

- [ ] **Step 4: Adicionar link no menu/header**

Adicionar botao "Cotacao" no header das paginas existentes, junto com "Assistente IA", "Minha Licenca", etc.

---

### Task 5: Testar end-to-end (modo EAN)

- [ ] **Step 1: Subir tabela mestre de teste**

Usar `precos.xlsx` do robo local como teste. Subir pelo frontend.

- [ ] **Step 2: Subir cotacao de teste e processar**

Usar um dos arquivos `Cotacao_Pronta_*.xlsx` como teste.

- [ ] **Step 3: Verificar resultado**

Baixar Excel preenchido e conferir se os precos EAN estao corretos.

---

### Task 6: Adicionar camada Gemini IA

**Files:**
- Modify: `backend/services/matching_engine.py`

- [ ] **Step 1: Adicionar funcao de matching com Gemini**

```python
import google.generativeai as genai
import json
import os

def matching_ia(itens_sem_match, precos_lista, api_key=None):
    """
    Usa Gemini Flash para tentar casar itens que o motor nao encontrou.
    Retorna dict {indice: (preco, "IA X%")}
    """
    if not api_key:
        api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key or not itens_sem_match:
        return {}

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-1.5-flash')

    # Preparar lista de precos resumida
    precos_texto = "\n".join([f"- {p['orig']}: R$ {p['preco']:.2f}" for p in precos_lista[:500]])
    itens_texto = "\n".join([f"[{i}] {item['nome']}" for i, item in itens_sem_match.items()])

    prompt = f"""Você é um especialista em produtos de atacado no Brasil.
Dados estes itens de uma cotação (sem preço encontrado):

{itens_texto}

E esta tabela de preços disponível:

{precos_texto}

Para cada item da cotação, encontre o produto mais similar da tabela de preços.
Responda APENAS em JSON: {{"indice": preço}}
Exemplo: {{"0": 12.50, "3": 8.90}}
Se não encontrar correspondente confiável, não inclua o índice."""

    try:
        response = model.generate_content(prompt)
        texto = response.text.strip()
        # Extrair JSON
        if "```" in texto:
            texto = texto.split("```")[1].split("```")[0]
        if "{" in texto:
            texto = texto[texto.index("{"):texto.rindex("}")+1]
        return json.loads(texto)
    except Exception:
        return {}
```

- [ ] **Step 2: Integrar IA no processar_cotacao**

Modificar `processar_cotacao` para, quando modo="completo", chamar `matching_ia` nos itens que sobraram do motor deterministico.
