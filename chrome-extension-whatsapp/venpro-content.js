// Syncs VenPro auth token to chrome.storage without exposing it in page localStorage.
function requestTokenFromPage() {
  return new Promise((resolve) => {
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timeout = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      resolve(null);
    }, 2500);

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

async function syncToken() {
  const token = await requestTokenFromPage();
  if (token) chrome.runtime.sendMessage({ action: 'saveToken', token });
}

syncToken();
setInterval(syncToken, 30000);
