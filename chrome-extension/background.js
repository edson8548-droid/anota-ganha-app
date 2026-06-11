// Background service worker — token sync + batch processing

const API_URL = 'https://api.venpro.com.br/api';
const BATCH   = 50;
const VENPRO_APP_URL_PATTERNS = [
  'https://venpro.com.br/*',
  'https://www.venpro.com.br/*',
  'https://*.venpro.com.br/*',
  'https://anota-ganha-app.web.app/*',
  'https://anota-ganha-app.firebaseapp.com/*',
];

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'saveToken') {
    chrome.storage.local.set({ venpro_token: msg.token, venpro_token_ts: Date.now() });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'getToken') {
    getToken().then(token => sendResponse({ token }));
    return true;
  }

  if (msg.action === 'startBatchProcessing') {
    // Save full job so we can resume after sleep
    chrome.storage.local.set({ processingJob: msg.data }, () => {
      runBatches(msg.data, 0, 0, 0, 0).catch(console.error);
    });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'resumeProcessing') {
    chrome.storage.local.get('processingJob', (data) => {
      if (data.processingJob) {
        chrome.storage.local.get('processingState', (s) => {
          const startBatch = s.processingState?.batchIndex ?? 0;
          const preenchidos    = s.processingState?.preenchidos ?? 0;
          const naoEncontrados = s.processingState?.naoEncontrados ?? 0;
          const processados    = s.processingState?.processados ?? 0;
          runBatches(data.processingJob, startBatch, preenchidos, naoEncontrados, processados).catch(console.error);
        });
      }
    });
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
    chrome.storage.local.remove(['processingState', 'processingJob']);
    sendResponse({ ok: true });
    return true;
  }
});

async function runBatches(job, startBatch, preenchidos, naoEncontrados, processados) {
  const { items, tabelaId, prazo, modo, tabId, empresaColuna = 0 } = job;
  const token = await getToken();
  if (!token) {
    await saveState({ status: 'paused', msg: 'Token expirado. Faça login no Venpro.', batchIndex: startBatch, total: items.length, processados, preenchidos, naoEncontrados, pct: Math.round(startBatch / Math.ceil(items.length / BATCH) * 100) });
    notifyPopup();
    return;
  }

  const totalBatches = Math.ceil(items.length / BATCH);

  for (let b = startBatch; b < totalBatches; b++) {
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
          try { await chrome.tabs.sendMessage(tabId, { action: 'fillPrices', prices: data.precos, empresaColuna }); } catch {}
        }
      } else {
        let msg = `Erro ${resp.status} ao buscar preços`;
        try {
          const data = await resp.json();
          msg = data.detail || msg;
        } catch {}
        await saveState({ status: 'error', msg, total: items.length, processados, preenchidos, naoEncontrados, pct: Math.round((b / totalBatches) * 100), batchIndex: b, ts: Date.now() });
        notifyPopup();
        return;
      }
    } catch (err) {
      await saveState({ status: 'error', msg: err.message || 'Erro de conexão com o servidor', total: items.length, processados, preenchidos, naoEncontrados, pct: Math.round((b / totalBatches) * 100), batchIndex: b, ts: Date.now() });
      notifyPopup();
      return;
    }

    const pct = Math.round(((b + 1) / totalBatches) * 100);
    // Save batchIndex = b+1 so resume starts from next batch
    await saveState({ status: 'processing', total: items.length, processados, preenchidos, naoEncontrados, pct, batchIndex: b + 1, ts: Date.now() });
    notifyPopup();
  }

  await saveState({ status: 'done', total: items.length, processados, preenchidos, naoEncontrados, pct: 100 });
  notifyPopup();
}

function getToken() {
  return getStoredToken().then(async (token) => {
    if (token) return token;
    return requestTokenFromOpenVenproTab();
  });
}

function getStoredToken() {
  return new Promise(resolve => {
    chrome.storage.local.get(['venpro_token', 'venpro_token_ts'], (data) => {
      const age = Date.now() - (data.venpro_token_ts || 0);
      resolve(data.venpro_token && age < 55 * 60 * 1000 ? data.venpro_token : null);
    });
  });
}

async function requestTokenFromOpenVenproTab() {
  const tabs = await getOpenVenproTabs();

  for (const tab of tabs) {
    const token = await requestTokenFromTab(tab.id);
    if (token) return token;
  }

  return null;
}

async function getOpenVenproTabs() {
  const byPattern = await chrome.tabs.query({ url: VENPRO_APP_URL_PATTERNS });
  const candidates = byPattern.filter(tab => tab?.id && isVenproAppUrl(tab.url || ''));
  if (candidates.length) return candidates;

  const allTabs = await chrome.tabs.query({});
  return allTabs.filter(tab => tab?.id && isVenproAppUrl(tab.url || ''));
}

function isVenproAppUrl(url = '') {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === 'api.venpro.com.br') return false;
    return host === 'venpro.com.br'
      || host.endsWith('.venpro.com.br')
      || host === 'anota-ganha-app.web.app'
      || host === 'anota-ganha-app.firebaseapp.com';
  } catch {
    return /^https:\/\/(?!(api)\.)([^/]+\.)?venpro\.com\.br(?:\/|$)/i.test(url)
      || /^https:\/\/anota-ganha-app\.(web\.app|firebaseapp\.com)(?:\/|$)/i.test(url);
  }
}

async function requestTokenFromTab(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'requestToken' });
    if (response?.token) {
      await chrome.storage.local.set({ venpro_token: response.token, venpro_token_ts: Date.now() });
      return response.token;
    }
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['venpro-content.js'] });
      await new Promise(resolve => setTimeout(resolve, 300));
      const response = await chrome.tabs.sendMessage(tabId, { action: 'requestToken' });
      if (response?.token) {
        await chrome.storage.local.set({ venpro_token: response.token, venpro_token_ts: Date.now() });
        return response.token;
      }
    } catch {}
  }
  return null;
}

function saveState(state) {
  return new Promise(resolve => chrome.storage.local.set({ processingState: state }, resolve));
}

function notifyPopup() {
  try { chrome.runtime.sendMessage({ action: 'progressUpdate' }); } catch {}
}
