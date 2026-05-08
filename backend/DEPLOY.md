# Deploy do Backend - Anota Ganha App

## Opções de Deploy

### 1. Render.com (Recomendado)

Crie arquivo `render.yaml` na raiz do backend:

```yaml
services:
  - type: web
    name: anota-ganha-api
    runtime: python
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn server:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: MONGO_URL
        sync: false
      - key: JWT_SECRET_KEY
        generateValue: true
      - key: MP_ACCESS_TOKEN
        sync: false
      - key: SENDGRID_API_KEY
        sync: false
```

### 2. Manual com Docker

Crie `Dockerfile`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build e run:
```bash
docker build -t anota-ganha-api .
docker run -p 8000:8000 --env-file .env anota-ganha-api
```

## Variáveis de Ambiente Obrigatórias

Antes do deploy, configure estas variáveis de ambiente:

| Variável | Descrição |
|----------|-----------|
| `MONGO_URL` | URL de conexão do MongoDB |
| `DB_NAME` | Nome do banco de dados |
| `JWT_SECRET_KEY` | Chave secreta para JWT |
| `MP_ACCESS_TOKEN` | Token do Mercado Pago |
| `SENDGRID_API_KEY` | Chave do SendGrid |
| `FRONTEND_URL` | URL do frontend |
| `BACKEND_URL` | URL do backend |

## Firebase Admin SDK

Para o Firebase Admin funcionar, você precisa:

1. Ir ao Firebase Console > Settings > Service accounts
2. Gerar nova chave privada
3. Copiar o conteúdo JSON para variáveis de ambiente:

```
FIREBASE_PROJECT_ID=seu-project-id
FIREBASE_PRIVATE_KEY_ID=chave-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nSUA_CHAVE\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@seu-project-id.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=seu-client-id
```

## Teste Local

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Editar .env com suas credenciais
uvicorn server:app --reload
```

API estará disponível em: http://localhost:8000
