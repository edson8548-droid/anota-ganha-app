const API_URL = 'https://api.venpro.com.br/api';
const TOKEN_TTL_MS = 55 * 60 * 1000;

// Open side panel when icon clicked
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
    getValidToken().then(token => sendResponse({ token }));
    return true;
  }

  // Download a photo from Firebase Storage URL and return as base64
  // (content scripts can't bypass CORS — background can)
  if (msg.action === 'downloadPhoto') {
    fetch(msg.url)
      .then(r => r.blob())
      .then(blob => new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res({ base64: reader.result, type: blob.type });
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      }))
      .then(data => sendResponse({ ok: true, ...data }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.action === 'registerSentNumber') {
    authenticatedFetch('/whatsapp/campanha/enviados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefone: msg.telefone }),
    }, msg.token)
      .then(r => sendResponse({ ok: r.ok, status: r.status }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.action === 'fetchCampaign') {
    authenticatedFetch('/whatsapp/campanha', {}, msg.token)
      .then(async r => {
        if (!r.ok) {
          sendResponse({ ok: false, status: r.status });
          return;
        }
        sendResponse({ ok: true, campaign: await r.json() });
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg.action === 'getDispatchState') {
    chrome.storage.local.get('dispatchState', (data) => {
      sendResponse({ state: data.dispatchState || null });
    });
    return true;
  }

  if (msg.action === 'saveDispatchState') {
    chrome.storage.local.set({ dispatchState: msg.state }, () => sendResponse({ ok: true }));
    return true;
  }

  if (msg.action === 'clearDispatchState') {
    chrome.storage.local.remove('dispatchState', () => sendResponse({ ok: true }));
    return true;
  }
});

async function getValidToken() {
  const stored = await chrome.storage.local.get(['venpro_token', 'venpro_token_ts']);
  const age = Date.now() - (stored.venpro_token_ts || 0);
  if (stored.venpro_token && age < TOKEN_TTL_MS) {
    return stored.venpro_token;
  }

  return requestTokenFromOpenVenproTab();
}

async function authenticatedFetch(path, options = {}, preferredToken = null) {
  const token = preferredToken || await getValidToken();
  let response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (response.status !== 401) return response;

  await chrome.storage.local.remove(['venpro_token', 'venpro_token_ts']);
  const freshToken = await requestTokenFromOpenVenproTab();
  if (!freshToken || freshToken === token) return response;

  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${freshToken}`,
    },
  });
}

async function requestTokenFromOpenVenproTab() {
  const tabs = await chrome.tabs.query({
    url: [
      'https://venpro.com.br/*',
      'https://www.venpro.com.br/*',
      'https://anota-ganha-app.web.app/*',
      'https://anota-ganha-app.firebaseapp.com/*',
    ],
  });

  for (const tab of tabs) {
    const token = await requestTokenFromTab(tab.id);
    if (token) return token;
  }

  return null;
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
