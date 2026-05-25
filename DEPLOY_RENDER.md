# Deploy do backend no Render

Este projeto usa o `render.yaml` da raiz para publicar o backend FastAPI no Render.

## Configuracao esperada

- Service name: `venpro-backend`
- Root directory: `backend`
- Runtime: Python
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn server:app --host 0.0.0.0 --port $PORT`
- Health check: `/health`

## Variaveis de ambiente

Configure no Render as variaveis abaixo. As que contem segredo devem ficar como secret no painel.

| Variavel | Valor esperado |
| --- | --- |
| `APP_ENV` | `production` |
| `RATE_LIMIT_ENABLED` | `true` |
| `CORS_ORIGINS` | `https://venpro.com.br,https://www.venpro.com.br` |
| `FRONTEND_URL` | `https://venpro.com.br` |
| `BACKEND_URL` | `https://api.venpro.com.br` |
| `MONGO_URL` | connection string do MongoDB Atlas |
| `DB_NAME` | banco de producao do Venpro |
| `ASAAS_API_KEY` | chave de producao do Asaas |
| `ASAAS_WEBHOOK_TOKEN` | token secreto do webhook Asaas |
| `ASAAS_BASE_URL` | `https://api.asaas.com/v3` |
| `AUDIT_HASH_SALT` | segredo longo para hash de auditoria |
| `EMAIL_PROVIDER` | `zeptomail` |
| `ZEPTOMAIL_SEND_MAIL_TOKEN` | token do ZeptoMail |
| `SENDER_EMAIL` | `suporte@venpro.com.br` |
| `FIREBASE_PROJECT_ID` | projeto Firebase de producao |
| `FIREBASE_PRIVATE_KEY_ID` | private key id da service account |
| `FIREBASE_PRIVATE_KEY` | private key da service account |
| `FIREBASE_CLIENT_EMAIL` | client email da service account |
| `FIREBASE_CLIENT_ID` | client id da service account |
| `FIREBASE_STORAGE_BUCKET` | bucket Firebase Storage, se usado |
| `SERPER_API_KEY` | chave Serper para buscas |

`SENDGRID_API_KEY` pode ficar configurada apenas se o provedor de email for alterado para SendGrid.

## Webhook Asaas

No painel do Asaas, configure o webhook de producao para:

```text
https://api.venpro.com.br/api/asaas/webhook
```

O header/token configurado no Asaas deve bater exatamente com `ASAAS_WEBHOOK_TOKEN`.

## Pos-deploy

Verifique:

```bash
curl https://api.venpro.com.br/health
```

Resposta esperada:

```json
{
  "status": "healthy",
  "database": "connected"
}
```

Tambem valide no navegador:

- `https://venpro.com.br`
- `https://venpro.com.br/manifest.json`
- `https://venpro.com.br/.well-known/assetlinks.json`
- `https://venpro.com.br/venpro-cotatudo-extension.zip`
- `https://venpro.com.br/venpro-whatsapp-extension.zip`

## Checklist rapido

- CORS limitado a `venpro.com.br` e `www.venpro.com.br`.
- Health check do Render apontando para `/health`.
- `DB_NAME` de producao preenchido no painel.
- Webhook Asaas usando `/api/asaas/webhook`.
- Firebase Hosting publicado a partir de `frontend/build`.
- ZIPs das extensoes publicados em `frontend/public`.
