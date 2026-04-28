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
const btnParar      = document.getElementById('btnParar');
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

async function loadCampaign() {
  const token = await getToken();
  if (!token) {
    setStatus('Faça login em venpro.com.br primeiro.', 'err');
    return;
  }
  try {
    const r = await fetch(`${API_URL}/whatsapp/campanha`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status === 403) {
      setStatus('Assinatura inativa. Renove em venpro.com.br', 'err');
      return;
    }
    if (!r.ok) throw new Error(`Erro ${r.status}`);
    campaign = await r.json();

    infoContatos.textContent = campaign.contacts_count;
    infoFotos.textContent    = campaign.photoUrls.length;
    infoMensagem.textContent = campaign.message ? '✓ configurada' : '✗ não configurada';
    campaignInfo.style.display = 'block';

    const ready = campaign.contacts_count > 0 && campaign.message;
    btnDisparar.disabled = !ready;
    setStatus(ready ? 'Campanha pronta para disparar.' : 'Configure contatos e mensagem em venpro.com.br', ready ? 'ok' : 'info');
  } catch {
    setStatus('Erro ao carregar campanha.', 'err');
  }
}

function applyDispatchState(state) {
  if (!state) return;
  const total = state.total || 1;
  const pct = Math.round((state.sent / total) * 100);
  progressWrap.style.display = 'block';
  progressBar.style.width = pct + '%';
  progressPct.textContent  = pct + '%';
  progressText.textContent = `${state.sent} / ${total} enviados`;
  if (state.invalidos > 0) invalidosWrap.textContent = `${state.invalidos} número(s) inválido(s)`;

  if (state.status === 'running') {
    const stuck = !state.ts || (Date.now() - state.ts) > STUCK_MS;
    stuckWrap.style.display  = stuck ? 'block' : 'none';
    cancelWrap.style.display = stuck ? 'none' : 'block';
    btnDisparar.disabled = true;
    btnDisparar.textContent = stuck ? 'Pausado' : 'Disparando...';
    setStatus(stuck ? `Pausado em ${pct}% — PC dormiu ou erro` : `Disparando... ${pct}%`, stuck ? 'err' : 'info');
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
  if (!campaign) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('web.whatsapp.com')) {
    setStatus('Abra o WhatsApp Web primeiro.', 'err');
    return;
  }
  const token = await getToken();
  if (!token) { setStatus('Token expirado. Faça login.', 'err'); return; }

  const pausaMin = parseInt(pausaMinEl.value) || 60;
  const pausaMax = Math.max(pausaMin, parseInt(pausaMaxEl.value) || 90);

  btnDisparar.disabled = true;
  btnDisparar.textContent = 'Disparando...';
  progressWrap.style.display = 'block';
  cancelWrap.style.display = 'block';
  setStatus('Iniciando disparo...', 'info');

  chrome.tabs.sendMessage(tab.id, {
    action: 'startDispatch',
    data: { campaign, token, pausaMin, pausaMax },
  });
});

btnRetomar.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('web.whatsapp.com')) { setStatus('Abra o WhatsApp Web.', 'err'); return; }
  const token = await getToken();
  stuckWrap.style.display = 'none';
  cancelWrap.style.display = 'block';
  btnDisparar.disabled = true;
  btnDisparar.textContent = 'Disparando...';
  setStatus('Retomando disparo...', 'info');
  chrome.tabs.sendMessage(tab.id, { action: 'resumeDispatch', token });
});

function cancelDispatch() {
  chrome.runtime.sendMessage({ action: 'clearDispatchState' }, () => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.url?.includes('web.whatsapp.com')) {
        chrome.tabs.sendMessage(tab.id, { action: 'cancelDispatch' });
      }
    });
    resetUI();
  });
}
btnCancelar.addEventListener('click', cancelDispatch);
btnParar.addEventListener('click', cancelDispatch);

// Init
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab?.url?.includes('web.whatsapp.com')) {
    setStatus('Abra o WhatsApp Web para usar o disparador.', 'err');
    campaignInfo.style.display = 'none';
    return;
  }
  chrome.runtime.sendMessage({ action: 'getDispatchState' }, r => {
    if (r?.state) applyDispatchState(r.state);
    loadCampaign();
  });
});
