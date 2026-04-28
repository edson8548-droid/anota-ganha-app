// Content script injected into venpro.com.br — syncs token to extension storage

function syncToken() {
  const token = localStorage.getItem('venpro_ext_token');
  if (token) {
    chrome.runtime.sendMessage({ action: 'saveToken', token });
  }
}

// Sync immediately on page load
syncToken();

// Sync when token changes (login/logout/refresh)
window.addEventListener('storage', (e) => {
  if (e.key === 'venpro_ext_token') syncToken();
});

// Sync every 30s to catch token refreshes
setInterval(syncToken, 30000);
