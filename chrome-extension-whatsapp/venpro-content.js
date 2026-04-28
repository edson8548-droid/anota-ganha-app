// Syncs Venpro auth token to chrome.storage for the extension to use
function syncToken() {
  const token = localStorage.getItem('venpro_ext_token');
  if (token) chrome.runtime.sendMessage({ action: 'saveToken', token });
}
syncToken();
window.addEventListener('storage', (e) => {
  if (e.key === 'venpro_ext_token') syncToken();
});
setInterval(syncToken, 30000);
