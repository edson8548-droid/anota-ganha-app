// Background service worker

// Get Firebase token from Venpro's localStorage via offscreen document or cookies
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getToken') {
    // Try to get the Firebase token from venpro.com.br's localStorage
    // We need to execute a script in the context of venpro.com.br
    chrome.scripting.executeScript({
      target: { url: 'https://venpro.com.br/*' },
      func: () => {
        // Firebase Auth stores the token in indexedDB or we can get it from the auth object
        // Try to find the Firebase Auth token
        const keys = Object.keys(localStorage);
        for (const key of keys) {
          if (key.startsWith('firebase:authUser')) {
            try {
              const data = JSON.parse(localStorage.getItem(key));
              if (data?.stsTokenManager?.accessToken) {
                return data.stsTokenManager.accessToken;
              }
            } catch {}
          }
        }
        return null;
      }
    }).then(results => {
      const token = results?.[0]?.result;
      sendResponse({ token });
    }).catch(() => {
      sendResponse({ token: null });
    });
    return true; // async response
  }
});
