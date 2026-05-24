# Venpro - Saude tecnica com 30 assinantes

Data: 2026-05-24

Contexto considerado:
- 30 usuarios pagantes usando o sistema de forma normal.
- Uso esperado: dashboard, Cotacao Pronta, Vitrine Inteligente, Carteira no WhatsApp e assinatura.
- Objetivo: registrar pontos de escala para consultar quando formos fazer melhorias, sem misturar com tarefas urgentes de lancamento.

## Resumo

Para 30 assinantes, o projeto aguenta se o backend ficar acordado e os fluxos principais continuarem com uso normal. O maior risco operacional nao e MongoDB nem cotacao; e o plano free do Render hibernar e causar demora no primeiro acesso.

Prioridade pratica:
1. Ao ter usuarios pagantes reais: tirar backend do plano free/hibernacao.
2. Antes de divulgar mais forte: criar indices de Mongo para vitrine e tabelas.
3. Quando checkout tiver mais uso: tirar chamadas sincronas do Asaas do event loop.
4. Quando passar de 100 usuarios: cachear verificacao de assinatura e avaliar Redis/fila.

## O que esta bom hoje

### MongoDB com Motor async

Status: ok para 30 assinantes.

O backend usa `AsyncIOMotorClient` com `maxPoolSize=10`, suficiente para uso normal com 30 assinantes. As rotas de cotacao usam jobs assincronos e nao deveriam segurar uma requisicao aberta por muito tempo.

Arquivo:
- `backend/server.py`

### Limite de cotacao simultanea

Status: ok.

O projeto ja usa indice unico em `cotacao_jobs` para segurar job ativo por usuario:
- `user_id`
- `type`
- `active`

Isso ajuda a evitar que o mesmo RCA dispare varias cotacoes simultaneas.

### IA desativada

Status: ok.

Como o Assistente IA foi desativado/limitado, nao ha risco relevante de custo de IA por uso normal do sistema.

### Uploads no Mongo/GridFS

Status: ok.

Imagens de avatar e vitrine vao para GridFS, nao dependem do disco efemero do Render. Isso e correto para producao no Render.

## Pontos em que a analise do Claude estava certa

### 1. Render Free hiberna

Status: correto e importante.

O `render.yaml` ainda esta com:

```yaml
plan: free
```

Risco:
- primeiro acesso depois de inatividade pode demorar;
- para assinante pagante, isso passa sensacao de site fora do ar;
- pior horario: inicio da manha, quando o RCA abre para trabalhar.

Acao recomendada:
- quando houver assinantes pagantes ou divulgacao mais forte, subir o backend para um plano sem hibernacao;
- confirmar valor atual no painel do Render antes de decidir;
- alternativa temporaria: monitor externo pingando `/health`, mas isso nao substitui plano pago para cliente pagante.

Marco recomendado:
- com 10 pagantes: avaliar upgrade;
- com 20-30 pagantes: upgrade recomendado.

### 2. Chamadas do Asaas sao sincronas

Status: correto.

O helper `_asaas_request()` usa `requests.request()` dentro de endpoints `async def`.

Arquivos:
- `backend/routes/asaas.py`

Risco:
- durante criacao/cancelamento de assinatura, a chamada HTTP para Asaas pode bloquear o event loop;
- com 30 usuarios isso deve ser raro, mas pode gerar lentidao pontual;
- o impacto maior aparece quando varias pessoas fazem checkout ao mesmo tempo.

Acao recomendada:
- trocar para helper async com `asyncio.to_thread(_asaas_request, ...)`; ou
- migrar para `httpx.AsyncClient`.

Prioridade:
- nao bloqueia lancamento;
- fazer quando o checkout comecar a ter movimento real.

### 3. Verificacao de assinatura le Firestore a cada rota protegida

Status: correto, mas aceitavel para 30 assinantes.

`ensure_subscription_access()` le o documento `subscriptions/{uid}` em cada chamada protegida.

Arquivo:
- `backend/services/subscription_access.py`

Risco:
- para 30 usuarios, custo e carga devem ficar baixos;
- para 100-200 usuarios, pode virar custo e latencia desnecessarios.

Acao futura:
- cache curto por UID, por exemplo 60 a 180 segundos;
- invalidar cache em webhook/cancelamento quando possivel.

Prioridade:
- deixar para depois de validar uso real.

### 4. Rate limiter em memoria

Status: correto, mas parcialmente mitigado.

O rate limiter continua em memoria, entao reinicia em deploy/restart. Ja foi melhorado para limpar chaves antigas e nao crescer indefinidamente.

Risco:
- nao e um controle forte contra ataques distribuidos ou restarts;
- para 30 assinantes legitimos nao e gargalo.

Acao futura:
- se houver ataque ou escala maior, mover rate limit para Redis ou servico externo.

Prioridade:
- baixa para lancamento;
- media quando houver campanha paga ou volume maior.

### 5. Indices de vitrine e tabelas

Status: correto.

Hoje o startup cria indices de cotacao, mas ainda nao cria indices explicitos para:
- `vitrine_offers`
- `vitrine_product_images`
- `tabelas_mestre`

Arquivos/consultas relevantes:
- `backend/routes/vitrine.py`
- `backend/routes/cotacao.py`

Consultas frequentes:
- `vitrine_offers.find({"created_by": uid, "status": {"$ne": "deleted"}})`
- `vitrine_offers.find_one({"slug": slug, "status": "active"})`
- `vitrine_offers.find_one({"_id": ObjectId(...), "created_by": uid})`
- `tabelas_mestre.find({"user_id": uid})`
- `tabelas_mestre.find_one({"_id": ObjectId(...), "user_id": uid})`
- `vitrine_product_images.find_one({"user_id": uid, ...})`

Acao recomendada:
- adicionar indices no startup do `backend/server.py`.

Indices sugeridos:

```python
await db.tabelas_mestre.create_index([("user_id", 1), ("created_at", -1)])
await db.vitrine_offers.create_index([("created_by", 1), ("status", 1), ("created_at", -1)])
await db.vitrine_offers.create_index([("slug", 1), ("status", 1)])
await db.vitrine_product_images.create_index([("user_id", 1), ("product_key", 1)])
await db.vitrine_product_images.create_index([("user_id", 1), ("ean", 1)])
```

Prioridade:
- pode ser feito antes ou logo depois do lancamento;
- e uma mudanca simples, de baixo risco e boa para preparar escala.

## O que nao precisa fazer agora

### Redis/fila

Nao precisa para 30 assinantes se o limite de cotacao simultanea continuar funcionando.

Fazer quando:
- houver muitos jobs simultaneos;
- cotacoes demorarem muito;
- precisar separar processamento pesado do web server.

### Cache de assinatura

Nao precisa agora.

Fazer quando:
- Firestore comecar a ficar caro;
- houver latencia perceptivel nas rotas protegidas;
- chegar perto de 100-200 usuarios ativos.

### Reescrever arquitetura

Nao precisa.

Para o lancamento, o melhor e corrigir gargalos pequenos e medir uso real.

## Plano por marco

### Agora / antes do lancamento

- Conferir site e API.
- Fazer backup Mongo.
- Testar cadastro, login, cotacao, vitrine e pagamento.
- Se der tempo, adicionar indices de vitrine/tabelas.

### Com 10 assinantes

- Verificar logs do Render.
- Medir tempo de resposta do `/health`.
- Verificar se houve reclamacao de demora no primeiro acesso.
- Avaliar upgrade do Render.

### Com 20-30 assinantes

- Tirar backend do plano free se ainda estiver nele.
- Adicionar ou confirmar indices de vitrine/tabelas.
- Revisar uso de CPU/memoria no Render.
- Revisar conexoes e operacoes no Mongo Atlas.

### Com 50 assinantes

- Teste de carga simples na Cotacao Pronta.
- Medir tempo de processamento de PDFs/Excels reais.
- Criar rotina semanal de revisao de logs.

### Com 100+ assinantes

- Avaliar Redis para rate limit/cache.
- Avaliar fila/worker para cotacao pesada.
- Cachear assinatura por alguns minutos.
- Melhorar alertas automaticos.

## Decisao atual

Para amanha, o lancamento organico pode acontecer sem grande mudanca de arquitetura.

Atencao principal:
- nao vender muito antes de testar fluxo real;
- observar suporte e logs;
- se aparecer demora no primeiro acesso, priorizar upgrade do Render.
