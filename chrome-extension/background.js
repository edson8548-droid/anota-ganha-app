// Background service worker

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'saveToken') {
    chrome.storage.local.set({ venpro_token: msg.token, venpro_token_ts: Date.now() });
    sendResponse({ ok: true });
    return true;
  }
  if (msg.action === 'getToken') {
    chrome.storage.local.get(['venpro_token', 'venpro_token_ts'], (data) => {
      const age = Date.now() - (data.venpro_token_ts || 0);
      // Token válido por até 55 min (Firebase tokens duram 1h)
      const token = data.venpro_token && age < 55 * 60 * 1000 ? data.venpro_token : null;
      sendResponse({ token });
    });
    return true;
  }
});
