// Content script injected into venpro.com.br. It reads the Firebase session
// from same-origin IndexedDB and avoids exposing tokens through page messages.

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
  const token = await readTokenFromFirebaseIndexedDb();
  if (token) {
    chrome.runtime.sendMessage({ action: 'saveToken', token });
  }
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
