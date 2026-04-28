// Background service worker — token sync + batch processing

const API_URL = 'https://api.venpro.com.br/api';

// ── Token ──────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'saveToken') {
    chrome.storage.local.set({ venpro_token: msg.token, venpro_token_ts: Date.now() });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'getToken') {
    chrome.storage.local.get(['venpro_token', 'venpro_token_ts'], (data) => {
      const age = Date.now() - (data.venpro_token_ts || 0);
      const token = data.venpro_token && age < 55 * 60 * 1000 ? data.venpro_token : null;
      sendResponse({ token });
    });
    return true;
  }

  // ── Processing ────────────────────────────────────────────────────────────
  if (msg.action === 'startBatchProcessing') {
    startBatchProcessing(msg.data).catch(console.error);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'getProcessingState') {
    chrome.storage.local.get('processingState', (data) => {
      sendResponse({ state: data.processingState || null });
    });
    return true;
  }

  if (msg.action === 'clearProcessingState') {
    chrome.storage.local.remove('processingState');
    sendResponse({ ok: true });
    return true;
  }
});

// ── Batch processing (runs in background, survives popup close) ────────────
async function startBatchProcessing({ items, tabelaId, prazo, modo, tabId }) {
  const token = await getToken();
  if (!token) {
    await saveState({ status: 'error', msg: 'Token expirado. Faça login no Venpro.' });
    return;
  }

  const BATCH = 50;
  const totalBatches = Math.ceil(items.length / BATCH);
  let preenchidos = 0, naoEncontrados = 0, processados = 0;

  await saveState({ status: 'processing', total: items.length, processados: 0, preenchidos: 0, naoEncontrados: 0, pct: 0 });
  notifyPopup({ action: 'progressUpdate' });

  for (let b = 0; b < totalBatches; b++) {
    const batch = items.slice(b * BATCH, (b + 1) * BATCH);

    try {
      const resp = await fetch(`${API_URL}/cotacao/match-cotatudo`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabela_id: tabelaId, prazo, modo, itens: batch }),
      });

      if (resp.ok) {
        const data = await resp.json();
        preenchidos    += data.stats.preenchidos;
        naoEncontrados += data.stats.nao_encontrados;
        processados    += data.stats.total;

        if (data.precos.length > 0) {
          try {
            await chrome.tabs.sendMessage(tabId, { action: 'fillPrices', prices: data.precos });
          } catch {}
        }
      }
    } catch {}

    const pct = Math.round(((b + 1) / totalBatches) * 100);
    await saveState({ status: 'processing', total: items.length, processados, preenchidos, naoEncontrados, pct });
    notifyPopup({ action: 'progressUpdate' });
  }

  await saveState({ status: 'done', total: items.length, processados, preenchidos, naoEncontrados, pct: 100 });
  notifyPopup({ action: 'progressUpdate' });
}

function getToken() {
  return new Promise(resolve => {
    chrome.storage.local.get(['venpro_token', 'venpro_token_ts'], (data) => {
      const age = Date.now() - (data.venpro_token_ts || 0);
      resolve(data.venpro_token && age < 55 * 60 * 1000 ? data.venpro_token : null);
    });
  });
}

function saveState(state) {
  return new Promise(resolve => chrome.storage.local.set({ processingState: state }, resolve));
}

function notifyPopup(msg) {
  try { chrome.runtime.sendMessage(msg); } catch {}
}
