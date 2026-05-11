const API_URL = 'https://api.venpro.com.br/api';
const STUCK_MS = 3 * 60 * 1000;

const statusEl      = document.getElementById('status');
const campaignInfo  = document.getElementById('campaignInfo');
const infoContatos  = document.getElementById('infoContatos');
const infoFotos     = document.getElementById('infoFotos');
const infoMensagem  = document.getElementById('infoMensagem');
const btnDisparar   = document.getElementById('btnDisparar');
const progressWrap  = document.getElementById('progressWrap');
const progressBar   = document.getElementById('progressBar');
const progressText  = document.getElementById('progressText');
const progressPct   = document.getElementById('progressPct');
const invalidosWrap = document.getElementById('invalidosWrap');
const stuckWrap     = document.getElementById('stuckWrap');
const cancelWrap    = document.getElementById('cancelWrap');
const btnRetomar    = document.getElementById('btnRetomar');
const btnCancelar   = document.getElementById('btnCancelar');
const btnPararContinuar = document.getElementById('btnPararContinuar');
const btnPararZerar = document.getElementById('btnPararZerar');
const pausaMinEl    = document.getElementById('pausaMin');
const pausaMaxEl    = document.getElementById('pausaMax');

let campaign = null;

function setStatus(text, type = 'info') {
  statusEl.textContent = text;
  statusEl.className = `status ${type}`;
}

async function getToken() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'getToken' }, r => resolve(r?.token));
  });
}

async function getWhatsAppTab() {
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  return tabs.find(tab => tab?.id && tab?.url?.includes('web.whatsapp.com')) || null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendMessageToTab(tabId, message) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response || {});
    });
  });
}

async function sendWhatsAppMessage(tabId, message) {
  let response = await sendMessageToTab(tabId, message);
  if (response) return response;

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await sleep(500);
    response = await sendMessageToTab(tabId, message);
    return response || null;
  } catch {
    return null;
  }
}

async function fetchCampaign(token) {
  const r = await fetch(`${API_URL}/whatsapp/campanha`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 403) {
    throw new Error('Assinatura inativa. Renove em venpro.com.br');
  }
  if (!r.ok) throw new Error(`Erro ${r.status}`);
  return r.json();
}

async function clearSentNumbers(token) {
  const r = await fetch(`${API_URL}/whatsapp/campanha/enviados`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Erro ${r.status}`);
}

async function loadCampaign() {
  const token = await getToken();
  if (!token) {
    setStatus('Faça login no Venpro e deixe uma aba do painel aberta.', 'err');
    return;
  }
  try {
    campaign = await fetchCampaign(token);

    infoContatos.textContent = campaign.contacts_count;
    infoFotos.textContent    = campaign.photoUrls.length;
    infoMensagem.textContent = campaign.message ? '✓ configurada' : '✗ não configurada';
    campaignInfo.style.display = 'block';

    const ready = campaign.contacts_count > 0 && campaign.message;
    btnDisparar.disabled = !ready;
    setStatus(ready ? 'Campanha pronta para disparar.' : 'Configure contatos e mensagem no Venpro', ready ? 'ok' : 'info');
  } catch (err) {
    setStatus(err.message || 'Erro ao carregar campanha.', 'err');
  }
}

function applyDispatchState(state) {
  if (!state) return;
  const total = state.total || 1;
  const processed = Math.min(total, Math.max(state.processed || 0, (state.sent || 0) + (state.invalidos || 0)));
  const rawPct = total ? (processed / total) * 100 : 0;
  const pctValue = rawPct > 0 && rawPct < 10 ? Math.max(0.1, Math.round(rawPct * 10) / 10) : Math.round(rawPct);
  const pctLabel = Number.isInteger(pctValue)
    ? `${pctValue}%`
    : `${pctValue.toFixed(1).replace('.', ',')}%`;
  progressWrap.style.display = 'block';
  progressBar.style.width = Math.min(100, Math.max(rawPct, processed > 0 ? 1 : 0)) + '%';
  progressPct.textContent  = pctLabel;
  progressText.textContent = `${state.sent || 0} / ${total} enviados`;
  if (state.invalidos > 0) invalidosWrap.textContent = `${state.invalidos} número(s) inválido(s)`;
  if (state.errorMsg) setStatus(state.errorMsg, 'err');

  if (state.status === 'running') {
    const stuck = !state.ts || (Date.now() - state.ts) > STUCK_MS;
    stuckWrap.style.display  = stuck ? 'block' : 'none';
    cancelWrap.style.display = stuck ? 'none' : 'block';
    btnDisparar.disabled = true;
    btnDisparar.textContent = stuck ? 'Pausado' : 'Disparando...';
    if (!state.errorMsg) {
      setStatus(stuck ? `Pausado em ${pctLabel} — PC dormiu ou erro` : `Disparando... ${pctLabel}`, stuck ? 'err' : 'info');
    }
  }
  if (state.status === 'done') {
    stuckWrap.style.display  = 'none';
    cancelWrap.style.display = 'none';
    btnDisparar.disabled = false;
    btnDisparar.textContent = 'Iniciar Disparo';
    setStatus(`Concluído! ${state.sent} mensagens enviadas.`, 'ok');
  }
}

function resetUI() {
  progressWrap.style.display = 'none';
  stuckWrap.style.display    = 'none';
  cancelWrap.style.display   = 'none';
  btnDisparar.disabled = !campaign || !campaign.contacts_count || !campaign.message;
  btnDisparar.textContent = 'Iniciar Disparo';
  invalidosWrap.textContent = '';
  setStatus('Pronto.', 'ok');
}

// Polling every 30s
setInterval(() => {
  chrome.runtime.sendMessage({ action: 'getDispatchState' }, r => {
    if (r?.state?.status === 'running') applyDispatchState(r.state);
  });
}, 30_000);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'dispatchUpdate') {
    chrome.runtime.sendMessage({ action: 'getDispatchState' }, r => {
      if (r?.state) applyDispatchState(r.state);
    });
  }
});

btnDisparar.addEventListener('click', async () => {
  const tab = await getWhatsAppTab();
  if (!tab) {
    setStatus('Abra o WhatsApp Web primeiro.', 'err');
    return;
  }
  const token = await getToken();
  if (!token) { setStatus('Login expirado. Abra o painel do Venpro e tente de novo.', 'err'); return; }

  try {
    campaign = await fetchCampaign(token);
  } catch (err) {
    setStatus(err.message || 'Erro ao carregar campanha.', 'err');
    return;
  }

  if (!campaign.contacts_count || !campaign.message) {
    setStatus('Configure contatos e mensagem no Venpro', 'err');
    return;
  }

  const pausaMin = parseInt(pausaMinEl.value) || 60;
  const pausaMax = Math.max(pausaMin, parseInt(pausaMaxEl.value) || 90);

  btnDisparar.disabled = true;
  btnDisparar.textContent = 'Disparando...';
  progressWrap.style.display = 'block';
  cancelWrap.style.display = 'block';
  setStatus('Iniciando disparo...', 'info');

  const response = await sendWhatsAppMessage(tab.id, {
    action: 'startDispatch',
    data: { campaign, token, pausaMin, pausaMax },
  });

  if (!response?.ok) {
    btnDisparar.disabled = false;
    btnDisparar.textContent = 'Iniciar Disparo';
    cancelWrap.style.display = 'none';
    setStatus('Não consegui conectar ao WhatsApp Web. Atualize a aba do WhatsApp e tente novamente.', 'err');
  }
});

btnRetomar.addEventListener('click', async () => {
  const tab = await getWhatsAppTab();
  if (!tab) { setStatus('Abra o WhatsApp Web.', 'err'); return; }
  const token = await getToken();
  stuckWrap.style.display = 'none';
  cancelWrap.style.display = 'block';
  btnDisparar.disabled = true;
  btnDisparar.textContent = 'Disparando...';
  setStatus('Retomando disparo...', 'info');
  const response = await sendWhatsAppMessage(tab.id, { action: 'resumeDispatch', token });
  if (!response?.ok) {
    btnDisparar.disabled = false;
    btnDisparar.textContent = 'Iniciar Disparo';
    cancelWrap.style.display = 'none';
    setStatus('Não consegui conectar ao WhatsApp Web. Atualize a aba do WhatsApp e tente novamente.', 'err');
  }
});

async function stopDispatch() {
  const tab = await getWhatsAppTab();
  if (tab) {
    await sendWhatsAppMessage(tab.id, { action: 'cancelDispatch' });
  }
  await new Promise(resolve => chrome.storage.local.remove('whatsappDispatchJob', resolve));
  await new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'clearDispatchState' }, resolve);
  });
}

async function cancelAndContinueLater() {
  await stopDispatch();
  await loadCampaign();
  resetUI();
  setStatus('Disparo cancelado. Ao iniciar de novo, vou pular quem já recebeu.', 'ok');
}

async function cancelAndStartFromZero() {
  const token = await getToken();
  if (!token) { setStatus('Login expirado. Abra o painel do Venpro e tente de novo.', 'err'); return; }
  await stopDispatch();
  try {
    await clearSentNumbers(token);
    await loadCampaign();
    resetUI();
    setStatus('Disparo cancelado. Ao iniciar de novo, começa do primeiro contato.', 'ok');
  } catch {
    setStatus('Não consegui zerar os enviados. Tente novamente.', 'err');
  }
}

btnCancelar.addEventListener('click', cancelAndContinueLater);
btnPararContinuar.addEventListener('click', cancelAndContinueLater);
btnPararZerar.addEventListener('click', cancelAndStartFromZero);

// Init
getWhatsAppTab().then(tab => {
  if (!tab) {
    setStatus('Abra o WhatsApp Web para usar a Carteira no WhatsApp.', 'err');
    campaignInfo.style.display = 'none';
    return;
  }
  chrome.runtime.sendMessage({ action: 'getDispatchState' }, r => {
    if (r?.state) applyDispatchState(r.state);
    loadCampaign();
  });
});
