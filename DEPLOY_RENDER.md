# 🚀 DEPLOY DO BACKEND NO RENDER

---

## 📋 PRÉ-REQUISITOS

### 1. Repositório no GitHub
```bash
# Certifique-se de que seu projeto está no GitHub
git remote -v
```

---

### 2. Conta no Render
- Acesse: https://dashboard.render.com
- Cadastre-se (é gratuito)
- Conecte seu repositório GitHub

---

### 3. Configurar Variáveis de Ambiente

Vá até: **New > Environment Variables**

E adicione estas variáveis:

| Variável | Valor | Descrição |
|-----------|-------|-----------|
| `FRONTEND_URL` | `https://anota-ganha-app.web.app` | URL do frontend |
| `BACKEND_URL` | `https://seu-backend-api-url-no-render.onrender.com` | URL do backend (será preenchida automaticamente) |
| `CORS_ORIGINS` | `https://venpro.com.br,https://www.venpro.com.br,https://anota-ganha-app.web.app,https://anota-ganha-app.firebaseapp.com` | Domínios permitidos |
| `MONGO_URL` | `mongodb+srv://usuario:senha@cluster.mongodb.net/database` | URL do MongoDB |
| `DB_NAME` | `anota_ganha` | Nome do banco |
| `JWT_SECRET_KEY` | `gerar-um-segredo-muito-longo-aqui` | Chave secreta para JWT |
| `ASAAS_API_KEY` | `sua_chave_asaas` | Chave da API Asaas |
| `ASAAS_WEBHOOK_TOKEN` | `seu_token_webhook` | Token de autenticação do webhook Asaas |
| `SENDGRID_API_KEY` | `SG.suas-chave-sendgrid` | Chave do SendGrid |
| `SENDER_EMAIL` | `suporte@venpro.com.br` | Email remetente |
| `RATE_LIMIT_ENABLED` | `true` | Rate limiting habilitado |

---

### 4. Verificar webhook do Asaas

Configure o webhook para receber notificações de pagamento:
- Acesse: https://www.mercadopago.com.br/developers/panel/credentials
- Encontre: Webhooks > Production > Webhooks
- Adicione: `https://seu-backend-api-url-no-render.onrender.com/api/mercadopago/webhook`
- Produzido: Production

---

### 5. Deploy Automático (Já configurado)

Se você quiser deploy automático, use o arquivo `render.yaml` que foi criado:
- Commit o arquivo no repositório
- Render irá fazer deploy automaticamente em cada push

---

## 📋 COMO FAZER DEPLOY AUTOMÁTICO

### Opção 1: Via Render.yaml (RECOMENDADO)

1. **Adicione o arquivo render.yaml ao seu repositório**

```bash
# No diretório raiz do projeto
git add render.yaml
git commit -m "chore: add Render deployment configuration"
git push
```

2. **O Render detectará o arquivo e fará deploy automático**

---

### Opção 2: Via Dashboard (Manual)

1. **Acesse o Render Dashboard**
   - https://dashboard.render.com

2. **Clique em "New"** ➜ **"Web Service"**

3. **Conecte seu repositório GitHub**

4. **Configure:**
   - **Name**: `anota-ganha-api`
   - **Runtime**: `Python`
   - **Build Command**: `pip install -r requirements.txt && uvicorn server:app --host 0.0.0.0 --port $PORT`
   - **Root Directory**: `/backend`

5. **Configure as Environment Variables** (veja tabela acima)

6. **Clique em "Deploy Web Service"**

7. **Espere o processo de build e deploy** (2-3 minutos)

8. **Seu backend estará disponível em:**
   - `https://seu-backend-api-url-no-render.onrender.com`

---

## 🔧 SOLUÇÃO DE PROBLEMAS COMUNS

### Problema: Backend não inicia

**Causa**: Variáveis de ambiente não configuradas ou URL do MongoDB incorreta

**Solução**:
1. Verifique se `MONGO_URL` está correta no Render
2. Verifique se o MongoDB Atlas permite conexão do Render (IP whitelist)
3. Verifique os logs do Render: `Logs > anota-ganha-api > server`

---

### Problema: CORS bloqueando requisições

**Causa**: `CORS_ORIGINS` não está configurado ou não contém a URL do frontend

**Solução**:
1. Certifique-se de que `CORS_ORIGINS` contém `https://anota-ganha-app.web.app`
2. Verifique os logs no backend: `[CORS] Preflight received from ...`
3. Verifique se o frontend está acessando o backend correto

---

## ✅ PÓS-DEPLOY

### Verificar se está funcionando

```bash
# Backend Health Check
curl https://seu-backend-api-url-no-render.onrender.com/health

# Deve retornar:
{
  "status": "healthy",
  "database": "connected"
}
```

---

## 📊 MONITORAMENTO

### Logs a verificar no Render Dashboard:

```
[SERVER] Venpro API started
[CORS] Preflight received from https://anota-ganha-app.web.app
[CORS] Preflight received from https://venpro.com.br
[SECURITY] auth_valid route=users
[SECURITY] rate_limit_exceeded ip=... path=...
[MONGO] Connected to MongoDB
[SECURITY] upload_blocked label=Imagem reason=too_large
[ERROR] Alguns erros podem ocorrer inicialmente
```

---

## 🎯 CHECKLIST DE FUNCIONALIDADE

- [ ] Health check retorna `"status": "healthy"`
- [ ] CORS está funcionando (sem erros no console)
- [ ] Upload de avatar funciona
- [ ] Validação de CPF está funcionando
- [ ] Vitrine pública está acessível
- [ ] Autenticação está funcionando

---

## 📞 SUPORTE

Se tiver algum problema:
1. Verifique os logs em tempo real: `Render Logs`
2. Verifique as variáveis de ambiente
3. Verifique a conexão com o MongoDB Atlas
4. Teste localmente: `cd backend && python server.py`

---

## 🚀 PRÓXIMO PASSO: DEPLOY COMPLETO

1. ✅ Segurança melhorada (CPF, telefone, uploads, rate limiting, CORS)
2. ✅ Validação robusta implementada no backend
3. ✅ Sanitização de inputs para prevenir XSS
4. ✅ SRI adicionado aos scripts externos
5. ✅ Logs de segurança implementados
6. ✅ Proteção de .env.files configurada
7. ✅ Frontend deployado no Firebase Hosting

**Backend pronto para deploy no Render!** 🎉
