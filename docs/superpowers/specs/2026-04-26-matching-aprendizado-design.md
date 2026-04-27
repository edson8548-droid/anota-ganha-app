# Spec: Matching Mais Preciso + Aprendizado por Correções

**Data:** 2026-04-26  
**Escopo:** Motor de matching do Robô de Cotação  
**Fases:** 2 (regras imediatas + banco de aprendizado)

---

## Problema

O robô preenche preços incorretos por similaridade quando só existe um SKU de uma marca na tabela. Exemplo real: tabela tinha apenas `CR DENT COLGATE MPA A/CARIE 90G`, e o robô preencheu com o mesmo preço (R$ 4,90) todos os outros Colgates da cotação — tamanhos diferentes (70g, 180g), linhas diferentes (Luminous White, Total 12, Natural) — por scores de 64–80%.

Quando o usuário corrige o Excel manualmente, esse conhecimento se perde: na próxima cotação o robô erra de novo.

---

## Fase 1 — Correção das Regras de Matching

### 1.1 Gramagem como trava obrigatória

**Arquivo:** `backend/services/matching_engine.py`

Extrair peso/volume de cada nome de produto usando regex:
```
padrão: \b(\d+[\.,]?\d*)\s*(G|GR|KG|ML|L|LT|UN|PCT|CX|SC)\b
```

Regra: se **ambos** os produtos têm gramagem declarada e ela é diferente → **não é match**, independente do score de similaridade. Se apenas um dos dois tem gramagem declarada → permite match (descrições incompletas são comuns em tabelas de atacadista).

Exemplos:
- `70G` vs `90G` → bloqueado (ambos têm gramagem diferente)
- `180G` vs `90G` → bloqueado
- `COLGATE MPA` vs `COLGATE MPA 90G` → permitido (tabela não tem gramagem)

### 1.2 Novas entradas em SUBTIPOS_EXCLUSIVOS

**Arquivo:** `backend/services/matching_engine.py`

Adicionar grupo de linhas de creme dental:
```python
{'LUMINOUS WHITE', 'LUMINOUS', 'MPA', 'TOTAL 12', 'TOTAL12', 
 'NATURAL', 'NAT', 'NEUTRACUCAR', 'NEUTRAZUCAR', 
 'SENSITIVE', 'SENSIVEL', 'TRIPLA', 'HERBAL', 
 'WHITENING', 'ANTICARIE', 'MAXFRESH', 'EXTRAFRESH'},
```

Outros grupos a adicionar seguindo o mesmo padrão:
- Shampoo linhas: `{LISO, CACHEADO, CACHOS, ONDULADO, FRIZZ, HIDRATACAO, NUTRICAO, RECONSTRUCAO, QUEDA, ANTIQUEDA, BOMBA, CERAMIDAS}`
- Absorvente tipo: `{COM ABAS, SEM ABAS, NOTURNO, DIARIO, INTERNO, EXTERNO}`
- Fraldas tamanho: consolidar tamanhos P/M/G/XG como exclusivos no mesmo grupo

### 1.3 Threshold 75% → 82%

**Arquivo:** `backend/services/matching_engine.py`

```python
TAXA_SIMILARIDADE = 0.82  # era 0.75
```

O match que gerou o problema (64%) seria bloqueado. Matches legítimos de descrições levemente diferentes ficam acima de 82%.

---

## Fase 2 — Tela de Revisão + Banco de Aprendizado

### 2.1 Novo endpoint: modo preview

**Arquivo:** `backend/routes/cotacao.py`

O endpoint existente `POST /cotacao/processar` ganha um parâmetro `modo=preview` (além dos modos já existentes). Quando `modo=preview`:
- Executa o pipeline completo de matching
- **Não gera o Excel ainda**
- Retorna JSON com a lista de resultados para revisão na tela

Resposta JSON:
```json
{
  "itens": [
    {
      "nome_cotacao": "CR DENT COLGATE LUMINOUS WHITE 70G",
      "nome_tabela": "CR DENT COLGATE MPA A/CARIE 90G",
      "preco": 4.90,
      "tipo": "SIMILAR",
      "score": 0.80,
      "status": "pendente"
    },
    {
      "nome_cotacao": "CR DENT COLGATE MPA A/CARIE 90G",
      "nome_tabela": "CR DENT COLGATE MPA A/CARIE 90G",
      "preco": 4.90,
      "tipo": "EAN",
      "score": 1.0,
      "status": "aprovado"
    },
    {
      "nome_cotacao": "CR DENT COLGATE MPA A/CARIE 180G",
      "nome_tabela": null,
      "preco": null,
      "tipo": null,
      "score": null,
      "status": "sem_match"
    }
  ],
  "session_id": "uuid-gerado-no-backend"
}
```

### 2.2 Novo endpoint: confirmar e gerar Excel

**Arquivo:** `backend/routes/cotacao.py`

`POST /cotacao/confirmar`

Recebe:
```json
{
  "session_id": "uuid",
  "tabela_id": "id-da-tabela",
  "itens": [
    {"nome_cotacao": "...", "nome_tabela": "...", "preco": 4.90, "aprovado": true},
    {"nome_cotacao": "...", "nome_tabela": "...", "preco": 4.90, "aprovado": false}
  ]
}
```

Ações:
1. Grava pares aprovados na coleção `cotacao_aprendizado` no MongoDB
2. Gera o Excel apenas com os itens aprovados preenchidos
3. Retorna o blob do Excel (mesmo comportamento atual do download)

### 2.3 Coleção MongoDB: `cotacao_aprendizado`

```json
{
  "_id": "ObjectId",
  "user_id": "firebase_uid",
  "produto_cotacao_norm": "CR DENT COLGATE MPA A CARIE 90G",
  "produto_tabela_norm": "CR DENT COLGATE MPA A CARIE 90G",
  "produto_tabela_orig": "CR DENT COLGATE MPA A/CARIE 90G",
  "preco": 4.90,
  "ean_tabela": "7891024141106",
  "confirmado": true,
  "created_at": "2026-04-26T...",
  "updated_at": "2026-04-26T..."
}
```

Índice: `{user_id: 1, produto_cotacao_norm: 1}` — busca rápida por usuário + nome normalizado.

### 2.4 Uso do aprendizado no pipeline

**Arquivo:** `backend/services/matching_engine.py` + `backend/routes/cotacao.py`

Antes de iniciar o matching fuzzy, para cada item da cotação:
1. Normalizar o nome
2. Consultar `cotacao_aprendizado` por `{user_id, produto_cotacao_norm}`
3. Se encontrar com `confirmado=true` → usar preço salvo, tipo `"APRENDIDO"`, pular matching
4. Se encontrar com `confirmado=false` → marcar como `sem_match`, pular matching
5. Se não encontrar → seguir pipeline normal (EAN → fuzzy → IA)

### 2.5 Tela de revisão no frontend

**Arquivo:** `frontend/src/pages/Cotacao.js` (ou componente separado `ReviewMatches.js`)

Fluxo:
1. Usuário sobe cotação + seleciona tabela → clica "Processar"
2. Spinner enquanto o backend processa em modo preview
3. Aparece a **tela de revisão** com tabela de itens:
   - Colunas: Produto da cotação | Produto encontrado | Preço | Confiança | Ação
   - 🟢 EAN ou APRENDIDO → linha verde, aprovado automaticamente (botão "Rejeitar" disponível)
   - 🟡 SIMILAR/APROX → linha amarela, botão "Aprovar" e "Rejeitar"
   - 🔴 Sem match → linha cinza, sem ação (fica em branco no Excel)
4. Botão "Confirmar e Baixar" no rodapé → chama `/cotacao/confirmar` → download do Excel

**Estado no componente:**
```javascript
const [reviewMode, setReviewMode] = useState(false);
const [reviewItens, setReviewItens] = useState([]);
const [sessionId, setSessionId] = useState(null);
```

---

## Arquivos Modificados

| Arquivo | Mudança |
|---|---|
| `backend/services/matching_engine.py` | Trava gramagem, novos SUBTIPOS_EXCLUSIVOS, threshold 82% |
| `backend/routes/cotacao.py` | Endpoint preview, endpoint confirmar, lookup aprendizado |
| `frontend/src/pages/Cotacao.js` | Tela de revisão, fluxo de aprovação |
| `frontend/src/pages/Cotacao.css` | Estilos da tela de revisão |
| `frontend/src/services/cotacao.service.js` | Função `confirmarCotacao()` |

---

## Fora do escopo

- Edição manual do preço na tela de revisão (usuário pode corrigir no Excel após download)
- Compartilhamento de aprendizado entre usuários diferentes
- Exportar/importar o banco de aprendizado
