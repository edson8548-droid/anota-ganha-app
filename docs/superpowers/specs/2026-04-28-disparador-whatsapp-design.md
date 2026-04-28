# Disparador WhatsApp — Design Spec

## Goal

Permitir que RCAs (Representantes Comerciais) configurem campanhas de oferta no site Venpro e disparem mensagens + fotos para uma lista de clientes via WhatsApp Web, através de uma extensão Chrome dedicada.

## Architecture

Três partes integradas via API Venpro:

1. **Venpro frontend** — nova página "Disparador WhatsApp" para configurar campanha
2. **Backend (Render)** — novos endpoints para armazenar campanha, parsear CSV, servir dados para a extensão
3. **Extensão Chrome WhatsApp** — extensão separada da extensão Cotatudo, roda em `web.whatsapp.com`, busca campanha e dispara mensagens

Um RCA tem **uma campanha ativa por vez**. A lista de contatos persiste até ser substituída manualmente. Fotos podem ser removidas após o disparo. A mensagem é editável antes de cada disparo.

Limites por plano (ex: X disparos por semana) são fora do escopo desta versão — ficam para iteração futura.

---

## Venpro Frontend

### Nova rota: `/disparador-whatsapp`

Nova entrada no menu do Dashboard (ícone: `MessageCircle`). Página com três blocos:

**Bloco 1 — Contatos**
- Botão "Subir CSV" (aceita `.csv`)
- Backend detecta automaticamente colunas de nome e telefone (mesma lógica do `meu_robo.py`)
- Após upload: exibe `"✓ 248 contatos carregados"` + botão "Substituir lista"
- Enquanto não há CSV: exibe instrução de upload

**Bloco 2 — Fotos da oferta**
- Área drag-and-drop + botão para selecionar arquivos (JPG, PNG, PDF)
- Limite: 20 arquivos, 50 MB total por campanha
- Exibe miniaturas com botão × por foto
- Botão "Limpar todas as fotos" (uso pós-disparo)
- Fotos armazenadas no Firebase Storage com leitura pública

**Bloco 3 — Mensagem**
- Texto fixo não editável: `"Bom dia/tarde/noite, [NOME]!"` (gerado na hora do envio)
- Campo de texto livre para o corpo da mensagem
- Botão **"Sugerir com IA"** → mini-chat inline: RCA descreve a oferta, Gemini retorna sugestão de texto chamativo
- RCA aceita ou edita manualmente
- Botão "Salvar mensagem"

**Botão de ação** no rodapé: `"Abrir WhatsApp Web →"` (abre `web.whatsapp.com` em nova aba com instrução para usar a extensão)

### Arquivos novos/modificados
- `frontend/src/pages/Disparador.js` — página principal
- `frontend/src/pages/Disparador.css` — estilos
- `frontend/src/routes/index.js` — adicionar rota `/disparador-whatsapp`
- `frontend/src/pages/Dashboard.js` — adicionar card "Disparador WhatsApp"

---

## Backend

### Novos endpoints — `backend/routes/whatsapp.py`

Todos requerem `Authorization: Bearer <token>` e verificam assinatura ativa (mesmo middleware de `license.py`). Retornam 403 com `{"detail": "Assinatura inativa"}` se plano expirado.

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/whatsapp/campanha` | Retorna campanha ativa do usuário |
| `POST` | `/api/whatsapp/campanha/contatos` | Upload CSV → parseia → salva contatos |
| `POST` | `/api/whatsapp/campanha/fotos` | Upload de imagens → Firebase Storage → salva URLs |
| `DELETE` | `/api/whatsapp/campanha/fotos` | Remove todas as fotos da campanha |
| `PUT` | `/api/whatsapp/campanha/mensagem` | Salva texto da mensagem |
| `POST` | `/api/whatsapp/campanha/ia-mensagem` | Recebe descrição, retorna sugestão via Gemini |
| `POST` | `/api/whatsapp/campanha/enviados` | Extensão reporta número enviado (para retomar) |

### Modelo Firestore — coleção `whatsapp_campaigns` (1 doc por userId)

```json
{
  "userId": "string",
  "contacts": [{ "nome": "string", "telefone": "string" }],
  "photoUrls": ["https://storage.googleapis.com/..."],
  "message": "string",
  "sentNumbers": ["5513999000000"],
  "updatedAt": "timestamp"
}
```

### CSV parsing
- Detecta automaticamente colunas de nome e telefone (busca por: `Nome`, `First Name`, `name`, `Phone`, `Telefone`, `Celular`, `WhatsApp` — case insensitive)
- Normaliza telefones: remove não-dígitos, adiciona `55` se não começar com código de país
- Rejeita linhas sem telefone válido
- Retorna `{ total: N, invalidos: M }` no response

### Arquivos novos/modificados
- `backend/routes/whatsapp.py` — todos os endpoints acima
- `backend/server.py` — registrar router `/api/whatsapp`

---

## Extensão Chrome WhatsApp

Extensão **separada** da extensão Cotatudo. Diretório: `chrome-extension-whatsapp/`.

### Arquivos

| Arquivo | Função |
|---------|--------|
| `manifest.json` | MV3, permissões: `storage`, `sidePanel`, `tabs`, `activeTab`, `scripting` |
| `background.js` | Abre side panel no clique; token sync (igual ao Cotatudo) |
| `panel.html` + `panel.js` | UI do side panel |
| `content.js` | Injeta em `web.whatsapp.com/*` — controla DOM do WhatsApp |
| `venpro-content.js` | Injeta em `venpro.com.br` — sincroniza token (reutilizado do Cotatudo) |

### Side Panel — estados

**Estado: sem campanha configurada**
```
Ven pro · Disparador WhatsApp
─────────────────────────────
⚠ Campanha não configurada.
Configure em venpro.com.br/
disparador-whatsapp
─────────────────────────────
[ Abrir Venpro ]
```

**Estado: campanha pronta**
```
Ven pro · Disparador WhatsApp
─────────────────────────────
✓ 248 contatos
✓ 12 fotos
✓ Mensagem salva
─────────────────────────────
Pausa entre envios
[60s ▼] a [90s ▼]
─────────────────────────────
[ Iniciar Disparo ]
```

**Estado: disparando**
```
████████░░░░  45%
112 / 248 enviados
3 números inválidos

[ Cancelar e recomeçar ]
```

**Estado: travado (ts > 3 min sem atualizar)**
```
⚠ Disparo pausado (erro/PC dormiu)
[ Retomar ]  [ Recomeçar ]
```

**Estado: assinatura inativa (403)**
```
⛔ Assinatura inativa.
Renove em venpro.com.br
[ Ir para o Venpro ]
```

### Fluxo de disparo (content.js)

Para cada contato não presente em `sentNumbers`:

1. Navega para `https://web.whatsapp.com/send?phone={telefone}&app_absent=0`
2. Aguarda até 40s para caixa de texto aparecer
3. Se detectar "número inválido" → registra como inválido, avança
4. Monta mensagem: `"{saudação}, {primeiroNome}!\n{mensagem do RCA}"`
   - Saudação: Bom dia (5h–12h) / Boa tarde (12h–18h) / Boa noite (18h–5h)
5. Digita e envia mensagem de texto
6. Aguarda 15 segundos
7. Para cada foto em `photoUrls`:
   - Baixa imagem via `fetch(url)` → `Blob` → `File`
   - Abre menu de anexo (seletores do `meu_robo.py` portados para JS)
   - Seta arquivo via `DataTransfer` no `input[type=file]`
   - Envia
8. Aguarda pausa aleatória entre `pausaMin` e `pausaMax` segundos (configurável no panel, padrão 60–90s)
9. Reporta número enviado para `POST /api/whatsapp/campanha/enviados`
10. Salva em `chrome.storage.local` como backup local
11. Avança para próximo contato

### Retomada

Ao abrir o panel com disparo em andamento: `sentNumbers` vem do Firestore (via `GET /campanha`) — contatos já enviados são pulados. Se API retorna 403, para e exibe aviso de assinatura.

### Seletores WhatsApp Web (portados do meu_robo.py)

```javascript
// Caixa de entrada principal
const CHAT_INPUT = [
  "footer [contenteditable='true']",
  "footer [role='textbox']",
  "div[title='Digite uma mensagem']",
];

// Botão de anexar
const ATTACH_BTN = [
  "[aria-label*='Anexar']", "[aria-label*='Attach']",
  "span[data-icon='attach-menu-plus']", "span[data-icon='clip']",
];

// Input de arquivo
const FILE_INPUT = ["input[type='file'][accept*='image']", "input[type='file']"];

// Botão enviar
const SEND_BTN = [
  "button[aria-label='Enviar']", "button[aria-label='Send']",
  "span[data-icon='send']", "span[data-icon='wds-ic-send-filled']",
];
```

---

## Controle de acesso

Qualquer endpoint `/api/whatsapp/*` verifica assinatura ativa via `license.py`. Se inativa → 403. A extensão trata 403 em qualquer chamada exibindo o aviso de assinatura e interrompendo o disparo.

---

## Fora do escopo desta versão

- Limites de campanhas por plano (ex: 3/semana no plano A, 5/semana no plano B)
- Ferramenta de criação de artes/ofertas dentro do Venpro
- Relatório detalhado de entrega por contato
- Agendamento de disparo
