// Content script injected into venpro.com.br. It reads the Firebase session
// from same-origin storage and avoids exposing tokens through page messages.

function decodeJwtPayload(token) {
  try {
    const payload = String(token || '').split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function isUsableToken(token) {
  if (!token || typeof token !== 'string') return false;
  if (token.length < 80 || token.split('.').length < 3) return false;
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 > Date.now() + 60_000;
}

function findTokenDeep(value, seen = new WeakSet()) {
  if (typeof value === 'string') {
    return isUsableToken(value) ? value : null;
  }

  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);

  const preferredKeys = [
    'accessToken',
    'idToken',
    'token',
    'authToken',
    'stsTokenManager',
    'user',
    'currentUser',
  ];

  for (const key of preferredKeys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const token = findTokenDeep(value[key], seen);
    if (token) return token;
  }

  for (const key of Object.keys(value)) {
    if (preferredKeys.includes(key)) continue;
    const token = findTokenDeep(value[key], seen);
    if (token) return token;
  }

  return null;
}

function parseJsonMaybe(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || !/^[{\["]/.test(trimmed)) return value;
  try { return JSON.parse(trimmed); } catch { return value; }
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
          const token = findTokenDeep(getAll.result || []);
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

function readTokenFromBrowserStorage() {
  try {
    const storages = [localStorage, sessionStorage].filter(Boolean);
    for (const storage of storages) {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        const raw = storage.getItem(key);
        const token = findTokenDeep(parseJsonMaybe(raw));
        if (token) return token;
      }
    }
  } catch {}
  return null;
}

async function syncToken() {
  const token = await readTokenFromFirebaseIndexedDb() || readTokenFromBrowserStorage();
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
