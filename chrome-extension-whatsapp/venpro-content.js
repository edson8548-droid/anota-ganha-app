// Syncs Venpro auth token to chrome.storage without exposing it in page localStorage.
function requestTokenFromPage() {
  return new Promise((resolve) => {
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timeout = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      resolve(null);
    }, 6000);

    function onMessage(event) {
      if (
        event.source !== window ||
        event.data?.type !== 'VENPRO_EXTENSION_TOKEN_RESPONSE' ||
        event.data?.requestId !== requestId
      ) {
        return;
      }
      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      resolve(event.data.token || null);
    }

    window.addEventListener('message', onMessage);
    window.postMessage({ type: 'VENPRO_EXTENSION_TOKEN_REQUEST', requestId }, window.location.origin);
  });
}

function readTokenFromFirebaseIndexedDb() {
  return new Promise((resolve) => {
    const request = indexedDB.open('firebaseLocalStorageDb');

    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      try {
        const tx = db.transaction('firebaseLocalStorage', 'readonly');
        const store = tx.objectStore('firebaseLocalStorage');
        const getAll = store.getAll();

        getAll.onerror = () => resolve(null);
        getAll.onsuccess = () => {
          const now = Date.now();
          const token = (getAll.result || [])
            .map(entry => entry?.value?.stsTokenManager)
            .find(manager => manager?.accessToken && (!manager.expirationTime || manager.expirationTime > now + 60_000))
            ?.accessToken;
          resolve(token || null);
        };
      } catch {
        resolve(null);
      } finally {
        setTimeout(() => db.close(), 0);
      }
    };
  });
}

async function syncToken() {
  const token = await requestTokenFromPage() || await readTokenFromFirebaseIndexedDb();
  if (token) chrome.runtime.sendMessage({ action: 'saveToken', token });
  return token;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'requestToken') {
    syncToken().then(token => sendResponse({ token }));
    return true;
  }
});

syncToken();
setInterval(syncToken, 30000);
