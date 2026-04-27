---
title: Robo de Cotacao no Site Venpro
date: 2026-04-24
status: approved
---

## Resumo

Portar o robo de cotacao (atualmente local) para o site Venpro. O RCA cadastra tabelas mestre de preco e processa cotacoes online, sem instalar nada.

## Funcionalidades

### 1. Cadastro de Tabelas Mestre (ate 5)

- RCA sobe planilhas Excel com tabela de preco de atacados
- Cada tabela tem nome personalizado (ex: "Atacado Bom Jesus", "Atacado Central")
- Limite de 5 tabelas por usuario
- Operacoes: adicionar, renomear, substituir arquivo, excluir
- Fica salva no servidor vinculada a conta do RCA

### 2. Processamento de Cotacao

- RCA seleciona qual tabela mestre usar
- RCA sobe apenas a cotacao (Excel do anexo 2)
- Escolhe modo de preenchimento:
  - **EAN apenas**: so codigo de barras, 100% certeza
  - **Completo**: EAN → descricao (3 camadas) → Gemini IA nos sobraram
- Recebe Excel preenchido para download

### 3. Resultado

- Relatorio de cobertura: quantos itens por cada metodo (EAN, descricao, IA, sem match)
- Itens preenchidos por IA marcados em amarelo no Excel
- Lista de itens nao encontrados para preenchimento manual

## Arquitetura

```
Frontend (React)                    Backend (FastAPI)
                                    /
Pagina Cotacao.js                  /  POST /api/cotacao/tabelas (upload)
  Aba "Minhas Tabelas"  ------->  /  GET  /api/cotacao/tabelas (lista)
  Aba "Nova Cotacao"    ------->  /  PUT  /api/cotacao/tabelas/{id} (renomear)
                                   / DELETE /api/cotacao/tabelas/{id} (excluir)
                                   / POST /api/cotacao/processar (processa)
```

### Processamento (POST /api/cotacao/processar)

Input: tabela_id, cotacao.xlsx, modo (ean|completo)

1. Le cotacao.xlsx → extrai produtos (codigo barras + descricao)
2. Le tabela mestre (MongoDB)
3. Camada EAN: match por codigo de barras (100% certeza)
4. Se modo=completo:
   a. Camada exata: nome normalizado identico
   b. Camada fuzzy: similaridade >= 75%
   c. Camada IA: Gemini Flash nos que sobraram
5. Gera Excel preenchido (itens IA em amarelo)
6. Retorna: excel + relatorio JSON

### Armazenamento

- Tabelas mestre: MongoDB (arquivo em GridFS, metadados em colecao `tabelas_mestre`)
- Cotas processadas: NAO salva, so devolve resultado
- Campos metadados: user_id, nome, data_upload, qtd_produtos, arquivo_gridfs_id

## Frontend

### Pagina Cotacao.js

Menu lateral existente + novo item "Cotacao" com icone de prancheta.

**Aba "Minhas Tabelas":**
- Cards com nome, qtd produtos, data atualizacao
- Botoes: renomear, substituir, excluir
- Botao "+ Adicionar Tabela" com drag-and-drop
- A ultima usada marcada como "Ativa"

**Aba "Nova Cotacao":**
- Dropdown para selecionar tabela mestre
- Radio buttons: modo EAN / modo Completo
- Area de upload da cotacao (drag-and-drop)
- Botao "Processar"
- Resultado: % cobertura + botoes download + lista nao-encontrados

## Matching Engine

Motor extraido do `robo_cotacao.py` local, adaptado para rodar no servidor:

- Normalizacao v5.0 (remover unidades, marcas, acentos, etc.)
- 3 camadas: exata → token similarity → fuzzy
- Novo: camada EAN (codigo de barras exato, primeira passada)
- Novo: camada Gemini Flash para sobras (apenas no modo completo)

## Dependencias

- Backend: openpyxl, python-Levenshtein (ou rapidfuzz), google-generativeai
- Frontend: React, axios, file-saver (download)
- Ja existente: FastAPI, MongoDB, Firebase Auth, Gemini

## Ordem de Implementacao

1. Extrair motor de matching do robo_cotacao.py para modulo independente
2. Backend: CRUD de tabelas mestre (/api/cotacao/tabelas)
3. Backend: processamento (/api/cotacao/processar) - so EAN primeiro
4. Frontend: pagina Cotacao.js com aba Minhas Tabelas
5. Frontend: aba Nova Cotacao com upload e download
6. Testar modo EAN end-to-end
7. Adicionar matching por descricao (3 camadas)
8. Adicionar camada Gemini Flash
9. Testar modo completo end-to-end
