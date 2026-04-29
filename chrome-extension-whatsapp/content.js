// Content script — runs on web.whatsapp.com
// Ports the dispatch logic from meu_robo.py to JavaScript

const API_URL = 'https://api.venpro.com.br/api';

// ── WhatsApp Web selectors (ported from meu_robo.py) ─────────────────────
const SEL_CHAT_INPUT = [
  "#main div[contenteditable='true'][data-tab='10']",
  "#main div[contenteditable='true'][role='textbox']",
  "div[contenteditable='true'][data-tab='10']",
  "div[contenteditable='true'][aria-label='Digite uma mensagem']",
  "div[contenteditable='true'][aria-label='Type a message']",
  "div[contenteditable='true'][role='textbox']",
  "div[contenteditable='true'].selectable-text",
  "div[title='Digite uma mensagem']",
];
const SEL_ATTACH = [
  "[aria-label*='Anexar']", "[aria-label*='Attach']",
  "span[data-icon='attach-menu-plus']", "span[data-icon='clip']",
  "span[data-icon='plus-rounded']", "[data-icon='plus-rounded']",
  "button[aria-label*='Attach']", "button[aria-label*='Anexar']",
];
const SEL_FILE_INPUT = [
  "input[type='file'][accept*='image']",
  "input[type='file'][accept*='video']",
  "input[type='file'][multiple]",
  "input[type='file']",
];
const SEL_SEND = [
  "button[aria-label='Enviar']", "button[aria-label='Send']",
  "span[data-icon='send']", "span[data-icon='wds-ic-send-filled']",
  "[data-testid='compose-btn-send']",
];
const SEL_CAPTION = [
  "div[role='dialog'] [contenteditable='true']",
  "[aria-label*='legenda']", "[aria-label*='caption']",
  "div[contenteditable='true'][data-tab='6']",
];
const INVALID_PATTERNS = [
  /número de telefone inválido/i,
  /phone number shared via url is invalid/i,
  /este número de telefone não está no whatsapp/i,
  /this phone number isn.t on whatsapp/i,
];

// ── State ─────────────────────────────────────────────────────────────────
let dispatching = false;
let cancelFlag  = false;

// ── Helpers ───────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function findFirst(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

async function waitFor(selectors, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const el = findFirst(selectors);
    if (el) return el;
    await sleep(500);
  }
  return null;
}

function isInvalidNumber() {
  const body = document.body.innerText;
  return INVALID_PATTERNS.some(p => p.test(body));
}

function saudacao() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function buildMessage(nome, msgTemplate) {
  const first = (nome || 'Cliente').trim().split(/\s+/)[0];
  const cap = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  return `${saudacao()}, ${cap}!\n${msgTemplate}`;
}

async function typeMessage(input, text) {
  input.click();
  input.focus();
  await sleep(300);

  // Clear any existing draft
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  await sleep(100);

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // execCommand works on Chrome; if it fails, fall back to InputEvent
    const ok = document.execCommand('insertText', false, lines[i]);
    if (!ok) {
      input.dispatchEvent(new InputEvent('input', {
        data: lines[i], inputType: 'insertText', bubbles: true,
      }));
    }
    if (i < lines.length - 1) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, keyCode: 13, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup',  { key: 'Enter', shiftKey: true, keyCode: 13, bubbles: true }));
      await sleep(80);
    }
  }
  await sleep(400);
}

async function clickSend() {
  const btn = findFirst(SEL_SEND);
  if (btn) { btn.click(); return; }
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

async function downloadPhoto(url) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'downloadPhoto', url }, r => {
      resolve(r?.ok ? r : null);
    });
  });
}

async function attachAndSendPhoto(base64, mimeType) {
  // Open attach menu
  const attachBtn = findFirst(SEL_ATTACH);
  if (!attachBtn) return false;
  const chatInput = findFirst(SEL_CHAT_INPUT);
  if (chatInput) { chatInput.click(); await sleep(300); }
  attachBtn.click();
  await sleep(700);

  // Find file input
  const fileInput = findFirst(SEL_FILE_INPUT);
  if (!fileInput) return false;

  // Convert base64 to File
  const arr = base64.split(',');
  const bstr = atob(arr[1]);
  const u8 = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
  const blob = new Blob([u8], { type: mimeType });
  const ext  = mimeType === 'application/pdf' ? 'pdf' : mimeType.split('/')[1] || 'jpg';
  const file = new File([blob], `oferta.${ext}`, { type: mimeType });

  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(1500);

  // Wait for send button in dialog / caption area
  const sendBtn = await waitFor(SEL_SEND, 8000);
  if (sendBtn) { sendBtn.click(); } else { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }
  await sleep(2000);
  return true;
}

// ── Main dispatch loop ────────────────────────────────────────────────────
async function dispatch(campaign, token, pausaMin, pausaMax, startIdx = 0) {
  dispatching = true;
  cancelFlag  = false;

  const contacts = campaign.contacts || [];
  const sentSet  = new Set(campaign.sentNumbers || []);
  const photos   = campaign.photoUrls || [];
  const msgTpl   = campaign.message || '';

  let sent = startIdx;
  let invalidos = 0;
  const total = contacts.length;

  async function saveState(status) {
    const state = { status, sent, total, invalidos, ts: Date.now(), startIdx: sent };
    await new Promise(r => chrome.runtime.sendMessage({ action: 'saveDispatchState', state }, r));
    chrome.runtime.sendMessage({ action: 'dispatchUpdate' });
  }

  for (let i = startIdx; i < contacts.length; i++) {
    if (cancelFlag) break;

    const { nome, telefone } = contacts[i];
    if (sentSet.has(telefone)) continue;

    await saveState('running');

    // Open chat
    window.location.href = `https://web.whatsapp.com/send?phone=${telefone}&app_absent=0`;
    await sleep(2000);

    // Wait for chat input (up to 40s)
    const chatInput = await waitFor(SEL_CHAT_INPUT, 40000);

    if (!chatInput || isInvalidNumber()) {
      invalidos++;
      await saveState('running');
      continue;
    }

    // 1. Send text message
    const fullMsg = buildMessage(nome, msgTpl);
    await typeMessage(chatInput, fullMsg);
    await sleep(300);
    await clickSend();
    await sleep(15000); // wait 15s before sending photos (same as meu_robo.py)

    // 2. Send photos
    if (cancelFlag) break;
    for (const url of photos) {
      if (cancelFlag) break;
      const photoData = await downloadPhoto(url);
      if (photoData) {
        await attachAndSendPhoto(photoData.base64, photoData.type);
        await sleep(1500);
      }
    }

    // 3. Register as sent
    sentSet.add(telefone);
    sent++;
    await saveState('running');
    try {
      await fetch(`${API_URL}/whatsapp/campanha/enviados`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone }),
      });
    } catch {}

    // 4. Random pause before next contact
    if (cancelFlag) break;
    const pausa = pausaMin + Math.random() * (pausaMax - pausaMin);
    await sleep(pausa * 1000);
  }

  await saveState(cancelFlag ? 'running' : 'done');
  dispatching = false;
}

// ── Message listener ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startDispatch') {
    const { campaign, token, pausaMin, pausaMax } = msg.data;
    dispatch(campaign, token, pausaMin, pausaMax, 0).catch(console.error);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'resumeDispatch') {
    chrome.runtime.sendMessage({ action: 'getDispatchState' }, r => {
      const state = r?.state;
      const startIdx = state?.startIdx ?? 0;
      // Re-fetch campaign to get updated sentNumbers
      fetch(`${API_URL}/whatsapp/campanha`, {
        headers: { Authorization: `Bearer ${msg.token}` },
      })
        .then(r => r.json())
        .then(camp => dispatch(camp, msg.token, 60, 90, startIdx))
        .catch(console.error);
    });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'cancelDispatch') {
    cancelFlag = true;
    dispatching = false;
    sendResponse({ ok: true });
    return true;
  }
});
