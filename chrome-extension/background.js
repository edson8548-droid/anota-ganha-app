// Background service worker — gets Firebase token from Venpro

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getToken') {
    getTokenFromVenpro()
      .then(token => sendResponse({ token }))
      .catch(() => sendResponse({ token: null }));
    return true;
  }
  if (msg.action === 'saveToken') {
    chrome.storage.local.set({ venpro_token: msg.token, venpro_token_ts: Date.now() });
    sendResponse({ ok: true });
    return true;
  }
});

const VENPRO_URLS = [
  'https://venpro.com.br/*',
  'https://www.venpro.com.br/*',
  'https://anota-ganha-app.web.app/*',
  'https://anota-ganha-app.firebaseapp.com/*',
];

async function getTokenFromVenpro() {
  // 1. Try to read directly from an open Venpro tab
  for (const urlPattern of VENPRO_URLS) {
    try {
      const tabs = await chrome.tabs.query({ url: urlPattern });
      if (tabs.length === 0) continue;

      const results = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => localStorage.getItem('venpro_ext_token'),
      });

      const token = results?.[0]?.result;
      if (token) {
        // Cache in extension storage
        await chrome.storage.local.set({ venpro_token: token, venpro_token_ts: Date.now() });
        return token;
      }
    } catch (err) {
      console.warn('Tab query failed for', urlPattern, err.message);
    }
  }

  // 2. Fallback: use cached token if fresh (< 55 min — Firebase tokens last 1h)
  try {
    const data = await chrome.storage.local.get(['venpro_token', 'venpro_token_ts']);
    const age = Date.now() - (data.venpro_token_ts || 0);
    if (data.venpro_token && age < 55 * 60 * 1000) {
      return data.venpro_token;
    }
  } catch {}

  return null;
}
