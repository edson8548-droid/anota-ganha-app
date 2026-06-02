const API_URL = 'https://api.venpro.com.br/api';
const BATCH = 50;
const STUCK_MS = 3 * 60 * 1000;
const BTN_LABEL = 'Preencher Cotação';
const SUPPORTED_SITE_MESSAGE = 'Abra uma cotação no Cotatudo, VR Cotação, RP HUB ou Rede de Fornecedores primeiro.';
const SITE_LABELS = {
  cotatudo: 'Cotatudo',
  'vr-cotacao': 'VR Cotação',
  'rp-hub': 'RP HUB',
  'rede-fornecedores': 'Rede de Fornecedores',
  generic: 'Cotação compatível',
};

const statusEl     = document.getElementById('status');
const siteDetectadoEl = document.getElementById('siteDetectado');
const tabelasEl    = document.getElementById('tabelas');
const prazoEl      = document.getElementById('prazo');
const modoEl       = document.getElementById('modo');
const empresaColunaEl = document.getElementById('empresaColuna');
const btnEl        = document.getElementById('btnPreencher');
const resultsEl    = document.getElementById('results');
const progressWrap = document.getElementById('progressWrap');
const progressBar  = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const progressPct  = document.getElementById('progressPct');
const stuckWrap    = document.getElementById('stuckWrap');
const cancelWrap   = document.getElementById('cancelWrap');
const btnRetomar   = document.getElementById('btnRetomar');
const btnCancelar  = document.getElementById('btnCancelar');
const btnParar     = document.getElementById('btnParar');

let tabelasCache = [];
let running = false;
let cancelRequested = false;

function setStatus(text, type = 'info') {
  statusEl.textContent = text;
  statusEl.className = `status ${type}`;
}

function setDetectedSite(tab, pageInfo = null) {
  const url = tab?.url || '';
  let label = 'Site detectado: nenhum site de cotação aberto';
  let type = 'err';

  if (pageInfo?.supported) {
    label = `Site detectado: ${SITE_LABELS[pageInfo.site] || SITE_LABELS.generic}`;
    type = 'ok';
  } else if (url.includes('cotatudo.com.br')) {
    label = 'Site detectado: Cotatudo';
    type = 'ok';
  } else if (/\/php\/vrcotacao\/cotacao\.php/i.test(url)) {
    label = 'Site detectado: VR Cotação';
    type = 'ok';
  } else if (url.includes('fornecedor.rpinfo.com.br') && /\/supplier\/quotations\//i.test(url)) {
    label = 'Site detectado: RP HUB';
    type = 'ok';
  } else if (isRedeFornecedoresUrl(url)) {
    label = 'Site detectado: Rede de Fornecedores';
    type = 'ok';
  }

  siteDetectadoEl.textContent = label;
  siteDetectadoEl.className = `status ${type}`;
}

function setProgress(pct, label) {
  progressWrap.style.display = 'block';
  progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  progressPct.textContent = `${pct}%`;
  progressText.textContent = label;
}

function hasTabelaSelecionada() {
  return !tabelasEl.disabled && Boolean(tabelasEl.value);
}

function isIdleButton() {
  return btnEl.textContent.trim() === BTN_LABEL;
}

function updateFillButtonState() {
  if (!isIdleButton()) return;
  btnEl.disabled = running || !hasTabelaSelecionada();
}

function showRunning() {
  running = true;
  stuckWrap.style.display = 'none';
  cancelWrap.style.display = 'block';
  btnEl.disabled = true;
  btnEl.textContent = 'Processando...';
}

function showStuck(state) {
  running = false;
  stuckWrap.style.display = 'block';
  cancelWrap.style.display = 'none';
  btnEl.disabled = true;
  btnEl.textContent = 'Pausado';
  setStatus(`Pausado em ${state.pct || 0}% - PC dormiu ou erro`, 'err');
}

function resetUI() {
  running = false;
  cancelRequested = false;
  progressWrap.style.display = 'none';
  stuckWrap.style.display = 'none';
  cancelWrap.style.display = 'none';
  resultsEl.style.display = 'none';
  btnEl.textContent = BTN_LABEL;
  updateFillButtonState();
  setStatus('Pronto.', 'ok');
}

function renderResults(state) {
  resultsEl.style.display = 'block';
  resultsEl.replaceChildren();

  const preenchidos = document.createElement('div');
  preenchidos.className = 'ok';
  preenchidos.textContent = `Preenchidos: ${state.preenchidos || 0} preços`;
  resultsEl.appendChild(preenchidos);

  if ((state.naoEncontrados || 0) > 0) {
    const naoEncontrados = document.createElement('div');
    naoEncontrados.className = 'warn';
    naoEncontrados.textContent = `Não encontrados: ${state.naoEncontrados}`;
    resultsEl.appendChild(naoEncontrados);
  }

  const total = document.createElement('div');
  total.style.marginTop = '4px';
  total.style.color = '#A0A3A8';
  total.textContent = `Total processado: ${state.processados || 0} itens`;
  resultsEl.appendChild(total);
}

function applyState(state) {
  if (!state) return;

  if (state.status === 'processing') {
    const stuck = state.ts && (Date.now() - state.ts) > STUCK_MS;
    setProgress(state.pct || 0, `${state.processados || 0} / ${state.total || 0} itens`);
    if (stuck) {
      showStuck(state);
    } else {
      showRunning();
      setStatus(`Processando... ${state.pct || 0}%`, 'info');
    }
  }

  if (state.status === 'paused') {
    setProgress(state.pct || 0, `${state.processados || 0} / ${state.total || 0} itens`);
    showStuck(state);
  }

  if (state.status === 'done') {
    running = false;
    stuckWrap.style.display = 'none';
    cancelWrap.style.display = 'none';
    btnEl.textContent = BTN_LABEL;
    updateFillButtonState();
    setProgress(100, `${state.processados || 0} / ${state.total || 0} itens`);
    setStatus('Preenchimento concluído!', 'ok');
    renderResults(state);
  }

  if (state.status === 'error') {
    running = false;
    stuckWrap.style.display = 'none';
    cancelWrap.style.display = 'none';
    btnEl.textContent = BTN_LABEL;
    updateFillButtonState();
    setStatus(`Erro: ${state.msg}`, 'err');
  }
}

function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

function storageSet(data) {
  return chrome.storage.local.set(data);
}

function storageRemove(keys) {
  return chrome.storage.local.remove(keys);
}

async function saveState(state) {
  await storageSet({ processingState: state });
  applyState(state);
}

async function getToken() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'getToken' }, r => resolve(r?.token || null));
  });
}

function isSupportedQuotationUrl(url = '') {
  return url.includes('cotatudo.com.br')
    || /\/php\/vrcotacao\/cotacao\.php/i.test(url)
    || (url.includes('fornecedor.rpinfo.com.br') && /\/supplier\/quotations\//i.test(url))
    || isRedeFornecedoresUrl(url);
}

function isPotentialQuotationUrl(url = '') {
  return isSupportedQuotationUrl(url)
    || /\/fornecedores\/.+\/cotacao\//i.test(url)
    || /\/cotacao\//i.test(url)
    || /\b(cotacao|cota[cç][aã]o|quotation|quotations|supplier|fornecedor|rfd)\b/i.test(url);
}

function isInjectableTab(tab) {
  const url = tab?.url || '';
  return Boolean(tab?.id) && /^https?:\/\//i.test(url) && !/\/\/([^/]+\.)?venpro\.com\.br\//i.test(url);
}

function isRedeFornecedoresUrl(url = '') {
  try {
    const parsed = new URL(url);
    return /(^|\.)rfd\.net\.br$/i.test(parsed.hostname);
  } catch {
    return /^(https?:\/\/)?([^/]+\.)?rfd\.net\.br\//i.test(url);
  }
}

async function getQuotationTab(options = {}) {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.id && isPotentialQuotationUrl(active.url || '')) return active;
  if (options.allowActiveFallback && isInjectableTab(active)) return active;

  const tabs = await chrome.tabs.query({
    url: [
      'https://cotatudo.com.br/*',
      'https://www.cotatudo.com.br/*',
      'https://fornecedor.rpinfo.com.br/*',
      'https://rfd.net.br/*',
      'https://www.rfd.net.br/*',
      'https://*.rfd.net.br/*',
      'http://rfd.net.br/*',
      'http://www.rfd.net.br/*',
      'http://*.rfd.net.br/*',
      'https://*/fornecedores/*/cotacao/*',
      'http://*/fornecedores/*/cotacao/*',
      'https://*/cotacao/*',
      'http://*/cotacao/*',
    ],
  });
  return tabs.find(tab => tab?.id) || null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createJobId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `cotatudo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function detectSiteFromUrl(url = '') {
  if (url.includes('cotatudo.com.br')) return 'cotatudo';
  if (/\/php\/vrcotacao\/cotacao\.php/i.test(url)) return 'vr-cotacao';
  if (url.includes('fornecedor.rpinfo.com.br') && /\/supplier\/quotations\//i.test(url)) return 'rp-hub';
  if (isRedeFornecedoresUrl(url)) return 'rede-fornecedores';
  return 'generic';
}

function sendMessageToTab(tab, message) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tab.id, message, response => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response || null);
    });
  });
}

async function ensureContentScript(tab) {
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
  await sleep(500);
}

async function detectPageInfo(tab) {
  if (!tab) return null;
  let response = await sendMessageToTab(tab, { action: 'detectSite' });
  if (response) return response;

  try {
    await ensureContentScript(tab);
    response = await sendMessageToTab(tab, { action: 'detectSite' });
    return response || null;
  } catch {
    return null;
  }
}

async function sendToQuotationPage(message) {
  const tab = await getQuotationTab({ allowActiveFallback: true });
  if (!tab) throw new Error(SUPPORTED_SITE_MESSAGE);

  let response = await sendMessageToTab(tab, message);
  if (response) return response;

  await ensureContentScript(tab);
  response = await sendMessageToTab(tab, message);
  if (!response) throw new Error('Não consegui conectar com a página da cotação. Atualize a aba e tente novamente.');
  return response;
}

async function reportFill(token, payload) {
  try {
    await fetch(`${API_URL}/cotacao/match-cotatudo/fill-report`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('[Venpro] Não foi possível registrar auditoria da extensão:', err?.message || err);
  }
}

async function loadTabelas() {
  try {
    btnEl.disabled = true;
    tabelasEl.disabled = true;

    const token = await getToken();
    if (!token) {
      setStatus('Faça login no venpro.com.br e deixe uma aba do painel aberta.', 'err');
      return;
    }

    const resp = await fetch(`${API_URL}/cotacao/tabelas`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error(`Erro ${resp.status}`);

    const tabelas = await resp.json();
    tabelasCache = Array.isArray(tabelas) ? tabelas : [];
    tabelasEl.innerHTML = '';

    if (tabelasCache.length === 0) {
      tabelasEl.innerHTML = '<option value="">Nenhuma tabela cadastrada</option>';
      setStatus('Nenhuma tabela encontrada.', 'err');
      return;
    }

    tabelasCache.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${t.nome} (${t.qtd_produtos} produtos)`;
      tabelasEl.appendChild(opt);
    });

    tabelasEl.disabled = false;
    syncPrazoOptions();
    updateFillButtonState();
    setStatus(`${tabelasCache.length} tabela(s) disponível(is).`, 'ok');
  } catch (err) {
    tabelasCache = [];
    tabelasEl.disabled = true;
    btnEl.disabled = true;
    setStatus(err.message || 'Erro ao carregar tabelas. Faça login no Venpro.', 'err');
  }
}

function syncPrazoOptions() {
  const tabela = tabelasCache.find(t => String(t.id) === String(tabelasEl.value));
  const prazos = Array.isArray(tabela?.prazos_disponiveis) && tabela.prazos_disponiveis.length
    ? tabela.prazos_disponiveis
    : [tabela?.prazo || 28];
  const selected = parseInt(prazoEl.value, 10);

  prazoEl.innerHTML = '';
  prazos.forEach((prazo) => {
    const opt = document.createElement('option');
    opt.value = String(prazo);
    opt.textContent = `${prazo} dias`;
    prazoEl.appendChild(opt);
  });
  prazoEl.value = prazos.includes(selected) ? String(selected) : String(prazos[0] || 28);
}

async function matchBatch(token, job, batch, batchIndex, totalBatches) {
  const resp = await fetch(`${API_URL}/cotacao/match-cotatudo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tabela_id: job.tabelaId,
      prazo: job.prazo,
      modo: job.modo,
      itens: batch,
      job_id: job.jobId,
      batch_index: batchIndex,
      total_batches: totalBatches,
      site: job.site,
    }),
  });

  if (!resp.ok) {
    let msg = `Erro ${resp.status} ao buscar preços`;
    try {
      const data = await resp.json();
      msg = data.detail || msg;
    } catch {}
    throw new Error(msg);
  }

  return resp.json();
}

async function runJob(job, startBatch = 0, initial = {}) {
  running = true;
  cancelRequested = false;
  await storageSet({ processingJob: job });

  const token = await getToken();
  if (!token) throw new Error('Login expirado. Abra o painel do Venpro e tente de novo.');

  const totalBatches = Math.ceil(job.items.length / BATCH);
  let preenchidos = initial.preenchidos || 0;
  let naoEncontrados = initial.naoEncontrados || 0;
  let processados = initial.processados || 0;

  for (let b = startBatch; b < totalBatches; b++) {
    if (cancelRequested) {
      await saveState({ status: 'paused', total: job.items.length, processados, preenchidos, naoEncontrados, pct: Math.round((b / totalBatches) * 100), batchIndex: b, ts: Date.now() });
      return;
    }

    const batch = job.items.slice(b * BATCH, (b + 1) * BATCH);
    const data = await matchBatch(token, job, batch, b + 1, totalBatches);
    const precos = Array.isArray(data.precos) ? data.precos : [];

    let filled = 0;
    let failedCount = 0;
    if (precos.length > 0) {
      const fillResult = await sendToQuotationPage({
        action: 'fillPrices',
        prices: precos,
        empresaColuna: job.empresaColuna || 0,
      });
      filled = fillResult?.filled || 0;
      failedCount = Array.isArray(fillResult?.failed) ? fillResult.failed.length : 0;
      if (filled === 0) {
        await reportFill(token, {
          event_type: 'batch',
          status: 'error',
          job_id: job.jobId,
          tabela_id: job.tabelaId,
          prazo: job.prazo,
          modo: job.modo,
          site: job.site,
          batch_index: b + 1,
          total_batches: totalBatches,
          total_itens: job.items.length,
          batch_total: batch.length,
          precos_recebidos: precos.length,
          preenchidos: filled,
          falhas: failedCount,
          nao_encontrados: data.stats?.nao_encontrados || 0,
          debug: {
            site_detectado: fillResult?.site || job.site,
            linhas_detectadas: fillResult?.rowCount || null,
            detalhes: Array.isArray(fillResult?.details) ? fillResult.details.slice(0, 20) : [],
          },
        });
        throw new Error('Encontrei preços, mas não consegui preencher os campos da cotação. Atualize a página e tente novamente.');
      }
    }

    preenchidos += filled || data.stats?.preenchidos || 0;
    naoEncontrados += data.stats?.nao_encontrados || 0;
    processados += data.stats?.total || batch.length;

    await reportFill(token, {
      event_type: 'batch',
      status: 'success',
      job_id: job.jobId,
      tabela_id: job.tabelaId,
      prazo: job.prazo,
      modo: job.modo,
      site: job.site,
      batch_index: b + 1,
      total_batches: totalBatches,
      total_itens: job.items.length,
      batch_total: batch.length,
      precos_recebidos: precos.length,
      preenchidos: filled || data.stats?.preenchidos || 0,
      falhas: failedCount,
      nao_encontrados: data.stats?.nao_encontrados || 0,
    });

    const pct = Math.round(((b + 1) / totalBatches) * 100);
    await saveState({ status: 'processing', total: job.items.length, processados, preenchidos, naoEncontrados, pct, batchIndex: b + 1, ts: Date.now() });
  }

  await reportFill(token, {
    event_type: 'job',
    status: 'done',
    job_id: job.jobId,
    tabela_id: job.tabelaId,
    prazo: job.prazo,
    modo: job.modo,
    site: job.site,
    total_itens: job.items.length,
    batch_total: job.items.length,
    preenchidos,
    nao_encontrados: naoEncontrados,
  });
  await saveState({ status: 'done', total: job.items.length, processados, preenchidos, naoEncontrados, pct: 100 });
  await storageRemove('processingJob');
}

async function startProcessing() {
  const tabelaId = tabelasEl.value;
  const prazo = parseInt(prazoEl.value, 10);
  const modo = modoEl.value;
  const empresaColuna = parseInt(empresaColunaEl.value, 10) || 0;

  if (!tabelaId) {
    setStatus('Selecione uma tabela.', 'err');
    return;
  }

  resultsEl.style.display = 'none';
  btnEl.disabled = true;
  btnEl.textContent = 'Iniciando...';
  setStatus('Lendo itens da cotação...', 'info');

  try {
    const tab = await getQuotationTab({ allowActiveFallback: true });
    const extractResult = await sendToQuotationPage({ action: 'extractItems', empresaColuna });
    const site = extractResult.site || detectSiteFromUrl(tab?.url || '');
    const items = (extractResult.items || []).filter(item => !item.filled && (item.nome || item.ean));

    if (items.length === 0) {
      btnEl.textContent = BTN_LABEL;
      updateFillButtonState();
      setStatus('Nenhum item aberto para preencher. Abra a cotação e confira se há itens sem preço.', 'err');
      return;
    }

    await storageRemove(['processingState', 'processingJob']);
    const job = { jobId: createJobId(), items, tabelaId, prazo, modo, empresaColuna, site };
    setProgress(0, `0 / ${items.length} itens`);
    showRunning();
    setStatus(`Processando ${items.length} itens...`, 'info');
    await runJob(job);
  } catch (err) {
    await saveState({ status: 'error', msg: err.message || 'Erro ao preencher cotação', total: 0, processados: 0, preenchidos: 0, naoEncontrados: 0, pct: 0, ts: Date.now() });
  }
}

async function resumeProcessing() {
  const data = await storageGet(['processingJob', 'processingState']);
  const job = data.processingJob;
  const state = data.processingState || {};
  if (!job?.items?.length) {
    resetUI();
    setStatus('Não encontrei processamento para retomar. Inicie novamente.', 'err');
    return;
  }

  stuckWrap.style.display = 'none';
  cancelWrap.style.display = 'block';
  btnEl.disabled = true;
  btnEl.textContent = 'Processando...';
  setStatus('Retomando processamento...', 'info');

  try {
    await runJob(job, state.batchIndex || 0, {
      preenchidos: state.preenchidos || 0,
      naoEncontrados: state.naoEncontrados || 0,
      processados: state.processados || 0,
    });
  } catch (err) {
    await saveState({ ...state, status: 'error', msg: err.message || 'Erro ao retomar processamento', ts: Date.now() });
  }
}

async function cancelAndReset() {
  cancelRequested = true;
  await storageRemove(['processingState', 'processingJob']);
  resetUI();
  loadTabelas();
}

tabelasEl.addEventListener('change', () => {
  syncPrazoOptions();
  updateFillButtonState();
});
prazoEl.addEventListener('change', updateFillButtonState);
modoEl.addEventListener('change', updateFillButtonState);
empresaColunaEl.addEventListener('change', () => {
  storageSet({ cotatudoEmpresaColuna: empresaColunaEl.value });
  updateFillButtonState();
});
btnEl.addEventListener('click', startProcessing);
btnRetomar.addEventListener('click', resumeProcessing);
btnCancelar.addEventListener('click', cancelAndReset);
btnParar.addEventListener('click', cancelAndReset);

async function init() {
  const data = await storageGet(['processingState', 'cotatudoEmpresaColuna']);
  if (data.cotatudoEmpresaColuna != null) {
    empresaColunaEl.value = String(data.cotatudoEmpresaColuna);
  }

  const tab = await getQuotationTab({ allowActiveFallback: true });
  const pageInfo = await detectPageInfo(tab);
  setDetectedSite(tab, pageInfo);
  if (!tab || (!isSupportedQuotationUrl(tab.url || '') && !pageInfo?.supported)) {
    setStatus(SUPPORTED_SITE_MESSAGE, 'err');
    tabelasEl.innerHTML = '<option value="">Necessário estar na cotação</option>';
    btnEl.disabled = true;
    return;
  }

  if (data.processingState) applyState(data.processingState);
  setStatus('Carregando tabelas...', 'info');
  await loadTabelas();
}

init();
