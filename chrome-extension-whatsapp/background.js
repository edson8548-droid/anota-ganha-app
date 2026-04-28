const API_URL = 'https://api.venpro.com.br/api';

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
    chrome.storage.local.get(['venpro_token', 'venpro_token_ts'], (data) => {
      const age = Date.now() - (data.venpro_token_ts || 0);
      const token = data.venpro_token && age < 55 * 60 * 1000 ? data.venpro_token : null;
      sendResponse({ token });
    });
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
