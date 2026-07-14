const API_URL = 'https://api.venpro.com.br/api';
const BATCH = 50;
const STUCK_MS = 3 * 60 * 1000;
const MAX_RESULT_DETAILS = 12;
const BTN_LABEL = 'Preencher Cotação';
const SUPPORTED_SITE_MESSAGE = 'Abra uma cotação no Cotatudo, VR Cotação, RP HUB, Rede de Fornecedores, Infomag Cotação, Intersolid Cotação, Cotação Web SMUS, Catalog Fornecedor, Hipcomerp, Easy Cotação Web, Estância, SG Cotação, HR Cotação, Arius Cotação, Bluesoft Cotação ou Guia Cotação primeiro.';
const SITE_LABELS = {
  cotatudo: 'Cotatudo',
  'vr-cotacao': 'VR Cotação',
  'rp-hub': 'RP HUB',
  'rede-fornecedores': 'Rede de Fornecedores',
  'infomag-cotacao': 'Infomag Cotação',
  'intersolid-cotacao': 'Intersolid Cotação',
  'cotacao-web-smus': 'Cotação Web SMUS',
  'bubble-catalog-fornecedor': 'Catalog Fornecedor',
  'hipcomerp-cotacao': 'Hipcomerp',
  'easy-cotacao-web': 'Easy Cotação Web',
  'estancia-cotacao': 'Estância',
  'sg-cotacao': 'SG Cotação',
  'hr-cotacao': 'HR Cotação',
  'arius-cotacao': 'Arius Cotação',
  'bluesoft-cotacao': 'Bluesoft Cotação',
  'guia-cotacao': 'Guia Cotação',
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

modoEl.value = 'ean';

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
  } else if (isInfomagCotacaoUrl(url)) {
    label = 'Site detectado: Infomag Cotação';
    type = 'ok';
  } else if (isIntersolidCotacaoUrl(url)) {
    label = 'Site detectado: Intersolid Cotação';
    type = 'ok';
  } else if (isCotacaoWebSmusUrl(url)) {
    label = 'Site detectado: Cotação Web SMUS';
    type = 'ok';
  } else if (isBubbleCatalogFornecedorUrl(url)) {
    label = 'Site detectado: Catalog Fornecedor';
    type = 'ok';
  } else if (isHipcomerpCotacaoUrl(url)) {
    label = 'Site detectado: Hipcomerp';
    type = 'ok';
  } else if (isEasyCotacaoWebUrl(url)) {
    label = 'Site detectado: Easy Cotação Web';
    type = 'ok';
  } else if (isEstanciaCotacaoUrl(url)) {
    label = 'Site detectado: Estância';
    type = 'ok';
  } else if (isSgCotacaoUrl(url)) {
    label = 'Site detectado: SG Cotação';
    type = 'ok';
  } else if (isHrCotacaoUrl(url)) {
    label = 'Site detectado: HR Cotação';
    type = 'ok';
  } else if (isAriusCotacaoUrl(url)) {
    label = 'Site detectado: Arius Cotação';
    type = 'ok';
  } else if (isBluesoftCotacaoUrl(url)) {
    label = 'Site detectado: Bluesoft Cotação';
    type = 'ok';
  } else if (isGuiaCotacaoUrl(url)) {
    label = 'Site detectado: Guia Cotação';
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

function compactText(value, max = 88) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function makeItemDetail(item = {}, reason = '') {
  return {
    idx: Number.isInteger(Number(item.idx)) ? Number(item.idx) : null,
    nome: compactText(item.nome || item.name || item.produto || 'Item sem nome'),
    ean: item.ean || '',
    codigo: item.codigo || '',
    reason: reason || item.reason || '',
    attempted: item.attempted || item.price || '',
    cellAfter: compactText(item.cellAfter || '', 60),
  };
}

function detailKey(detail) {
  return [
    detail.idx ?? '',
    detail.ean || '',
    detail.codigo || '',
    detail.nome || '',
    detail.reason || '',
  ].join('|');
}

function mergeResultDetails(existing = [], additions = [], limit = 40) {
  const merged = [];
  const seen = new Set();
  for (const detail of [...existing, ...additions]) {
    if (!detail) continue;
    const normalized = makeItemDetail(detail, detail.reason);
    const key = detailKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(normalized);
    if (merged.length >= limit) break;
  }
  return merged;
}

function missingDetailsForBatch(batch = [], precos = [], mantidos = []) {
  const pricedIdx = new Set([
    ...(precos || []).map(preco => Number(preco.idx)),
    ...(mantidos || []).map(idx => Number(idx)),
  ]);
  return (batch || [])
    .filter(item => !pricedIdx.has(Number(item.idx)))
    .map(item => makeItemDetail(item, 'sem_preco_na_tabela'));
}

function failureDetailsFromFill(fillResult, prices = []) {
  const details = Array.isArray(fillResult?.details) ? fillResult.details : [];
  const failed = Array.isArray(fillResult?.failed) ? fillResult.failed : [];
  const pricesByIdx = new Map((prices || []).map(item => [Number(item.idx), item]));

  if (details.length) {
    return details.map(detail => {
      const item = pricesByIdx.get(Number(detail.idx)) || {};
      return makeItemDetail({
        ...item,
        ...detail,
        reason: detail.reason || detail.bridge?.reason || 'falha_preenchimento',
      });
    });
  }

  return failed.map(idx => makeItemDetail(pricesByIdx.get(Number(idx)) || { idx }, 'falha_preenchimento'));
}

function fillDiagnosticLines(fillResult, prices = [], limit = 20) {
  const pricesByIdx = new Map((prices || []).map(item => [Number(item.idx), item]));
  return (fillResult?.details || []).slice(0, limit).map(detail => {
    const item = pricesByIdx.get(Number(detail.idx)) || {};
    return [
      `idx=${detail.idx ?? item.idx ?? ''}`,
      `ean=${item.ean || ''}`,
      `tentado=${item.price || ''}`,
      `motivo=${detail.reason || detail.bridge?.reason || 'falha_preenchimento'}`,
      `depois=${compactText(detail.after || detail.cellAfter || '', 30)}`,
    ].join('|');
  });
}

function renderResultDetails(title, details) {
  if (!Array.isArray(details) || details.length === 0) return;

  const wrap = document.createElement('details');
  wrap.className = 'result-details';

  const summary = document.createElement('summary');
  summary.textContent = `${title}: ${details.length} item(ns)`;
  wrap.appendChild(summary);

  const list = document.createElement('ul');
  details.slice(0, MAX_RESULT_DETAILS).forEach(detail => {
    const li = document.createElement('li');
    const titleLine = document.createElement('div');
    titleLine.textContent = detail.nome || 'Item sem nome';
    li.appendChild(titleLine);

    const meta = [];
    if (detail.idx !== null && detail.idx !== undefined) meta.push(`linha ${detail.idx + 1}`);
    if (detail.ean) meta.push(`EAN ${detail.ean}`);
    if (detail.codigo) meta.push(`cód. ${detail.codigo}`);
    if (detail.reason) meta.push(detail.reason);
    if (detail.attempted) meta.push(`preço ${detail.attempted}`);
    if (detail.cellAfter) meta.push(`célula: ${detail.cellAfter}`);
    if (meta.length) {
      const small = document.createElement('small');
      small.textContent = meta.join(' · ');
      li.appendChild(small);
    }
    list.appendChild(li);
  });

  if (details.length > MAX_RESULT_DETAILS) {
    const li = document.createElement('li');
    li.textContent = `+ ${details.length - MAX_RESULT_DETAILS} item(ns) ocultos`;
    list.appendChild(li);
  }

  wrap.appendChild(list);
  resultsEl.appendChild(wrap);
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

  if ((state.falhas || 0) > 0) {
    const falhas = document.createElement('div');
    falhas.className = 'warn';
    falhas.textContent = `Com preço, mas não preenchidos: ${state.falhas}`;
    resultsEl.appendChild(falhas);
  }

  const total = document.createElement('div');
  total.style.marginTop = '4px';
  total.style.color = '#A0A3A8';
  total.textContent = `Total processado: ${state.processados || 0} itens`;
  resultsEl.appendChild(total);

  renderResultDetails('Amostra dos não encontrados', state.naoEncontradosDetalhes);
  renderResultDetails('Com preço, mas falharam', state.falhasDetalhes);
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
    if ((state.processados || state.preenchidos || state.naoEncontrados || state.falhas)
      || (Array.isArray(state.naoEncontradosDetalhes) && state.naoEncontradosDetalhes.length)
      || (Array.isArray(state.falhasDetalhes) && state.falhasDetalhes.length)) {
      renderResults(state);
    }
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
    || isRedeFornecedoresUrl(url)
    || isInfomagCotacaoUrl(url)
    || isIntersolidCotacaoUrl(url)
    || isCotacaoWebSmusUrl(url)
    || isBubbleCatalogFornecedorUrl(url)
    || isHipcomerpCotacaoUrl(url)
    || isEasyCotacaoWebUrl(url)
    || isEstanciaCotacaoUrl(url)
    || isSgCotacaoUrl(url)
    || isHrCotacaoUrl(url)
    || isAriusCotacaoUrl(url)
    || isBluesoftCotacaoUrl(url)
    || isGuiaCotacaoUrl(url);
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

function isInfomagCotacaoUrl(url = '') {
  try {
    const parsed = new URL(url);
    return /(^|\.)infomagcotacao\.com$/i.test(parsed.hostname) && /\/cotacao\/?$/i.test(parsed.pathname);
  } catch {
    return /^(https?:\/\/)?([^/]+\.)?infomagcotacao\.com\/cotacao\/?$/i.test(url);
  }
}

function isIntersolidCotacaoUrl(url = '') {
  try {
    const parsed = new URL(url);
    return /(^|\.)intersolid\.com\.br$/i.test(parsed.hostname)
      && /cotacao/i.test(`${parsed.hostname}${parsed.pathname}`);
  } catch {
    return /^(https?:\/\/)?([^/]+\.)?intersolid\.com\.br\//i.test(url) && /cotacao/i.test(url);
  }
}

function isCotacaoWebSmusUrl(url = '') {
  try {
    const parsed = new URL(url);
    return /(^|\.)cotacaoweb\.smus\.com\.br$/i.test(parsed.hostname)
      && /cotacaoweb|ViewCotacaoDetalhe|cotacao/i.test(`${parsed.pathname}${parsed.hash}`);
  } catch {
    return /^(https?:\/\/)?cotacaoweb\.smus\.com\.br(?::\d+)?\//i.test(url);
  }
}

function isBubbleCatalogFornecedorUrl(url = '') {
  try {
    const parsed = new URL(url);
    return /^catalog-32594\.bubbleapps\.io$/i.test(parsed.hostname)
      && /(^|\/)fornecedor\/?$/i.test(parsed.pathname);
  } catch {
    return /^(https?:\/\/)?catalog-32594\.bubbleapps\.io\/.*fornecedor\/?$/i.test(url);
  }
}

function isHipcomerpCotacaoUrl(url = '') {
  try {
    const parsed = new URL(url);
    return /(^|\.)cotacao\.hipcomerp\.com\.br$/i.test(parsed.hostname);
  } catch {
    return /^(https?:\/\/)?cotacao\.hipcomerp\.com\.br(?:\/|#|$)/i.test(url);
  }
}

function isEasyCotacaoWebUrl(url = '') {
  try {
    const parsed = new URL(url);
    return /(^|\.)gepautomacao\.dyndns\.org$/i.test(parsed.hostname)
      && /easycotacao|cotacao/i.test(`${parsed.pathname}${parsed.hash}`);
  } catch {
    return /^(https?:\/\/)?gepautomacao\.dyndns\.org(?::\d+)?\/.*easycotacao/i.test(url);
  }
}

function isEstanciaCotacaoUrl(url = '') {
  try {
    const parsed = new URL(url);
    return /(^|\.)cotacao\.estanciasupermercados\.com\.br$/i.test(parsed.hostname)
      && /\/(home|cotacao)\.asp$/i.test(parsed.pathname);
  } catch {
    return /^(https?:\/\/)?cotacao\.estanciasupermercados\.com\.br\/(?:home|cotacao)\.asp/i.test(url);
  }
}

function isSgCotacaoUrl(url = '') {
  try {
    const parsed = new URL(url);
    return /(^|\.)cotacao\.sghost\.com\.br$/i.test(parsed.hostname);
  } catch {
    return /^(https?:\/\/)?cotacao\.sghost\.com\.br(?:\/|#|$)/i.test(url);
  }
}

function isHrCotacaoUrl(url = '') {
  try {
    const parsed = new URL(url);
    return /(^|\.)cotacao\.hrtech\.com\.br$/i.test(parsed.hostname);
  } catch {
    return /^(https?:\/\/)?cotacao\.hrtech\.com\.br(?:\/|#|$)/i.test(url);
  }
}

function isAriusCotacaoUrl(url = '') {
  try {
    const parsed = new URL(url);
    return /(^|\.)arius-web\./i.test(parsed.hostname);
  } catch {
    return /^(https?:\/\/)?[^/]*\.arius-web\./i.test(url);
  }
}

function isBluesoftCotacaoUrl(url = '') {
  try {
    const parsed = new URL(url);
    return /(^|\.)erp\.bluesoft\.com\.br$/i.test(parsed.hostname);
  } catch {
    return /^(https?:\/\/)?erp\.bluesoft\.com\.br(?:\/|$)/i.test(url);
  }
}

function isGuiaCotacaoUrl(url = '') {
  try {
    const parsed = new URL(url);
    return /(^|\.)cg\.jrsupermercados\.com\.br$/i.test(parsed.hostname)
      && /\/Fornecedores\/Precificar/i.test(parsed.pathname);
  } catch {
    return /cg\.jrsupermercados\.com\.br\/Fornecedores\/Precificar/i.test(url);
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
      'https://infomagcotacao.com/*',
      'https://www.infomagcotacao.com/*',
      'https://cotacaonovo.intersolid.com.br/*',
      'http://cotacaonovo.intersolid.com.br/*',
      'https://*.intersolid.com.br/*',
      'http://*.intersolid.com.br/*',
      'https://cotacaoweb.smus.com.br/*',
      'http://cotacaoweb.smus.com.br/*',
      'https://catalog-32594.bubbleapps.io/*',
      'https://cotacao.hipcomerp.com.br/*',
      'http://cotacao.hipcomerp.com.br/*',
      'https://gepautomacao.dyndns.org/*',
      'http://gepautomacao.dyndns.org/*',
      'https://cotacao.estanciasupermercados.com.br/*',
      'http://cotacao.estanciasupermercados.com.br/*',
      'https://cotacao.sghost.com.br/*',
      'http://cotacao.sghost.com.br/*',
      'https://cotacao.hrtech.com.br/*',
      'http://cotacao.hrtech.com.br/*',
      'https://*.arius-web.harpocloud.com.br/*',
      'http://*.arius-web.harpocloud.com.br/*',
      'https://erp.bluesoft.com.br/*',
      'http://erp.bluesoft.com.br/*',
      'https://cg.jrsupermercados.com.br/*',
      'http://cg.jrsupermercados.com.br/*',
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
  if (isInfomagCotacaoUrl(url)) return 'infomag-cotacao';
  if (isIntersolidCotacaoUrl(url)) return 'intersolid-cotacao';
  if (isCotacaoWebSmusUrl(url)) return 'cotacao-web-smus';
  if (isBubbleCatalogFornecedorUrl(url)) return 'bubble-catalog-fornecedor';
  if (isHipcomerpCotacaoUrl(url)) return 'hipcomerp-cotacao';
  if (isEasyCotacaoWebUrl(url)) return 'easy-cotacao-web';
  if (isEstanciaCotacaoUrl(url)) return 'estancia-cotacao';
  if (isSgCotacaoUrl(url)) return 'sg-cotacao';
  if (isHrCotacaoUrl(url)) return 'hr-cotacao';
  if (isAriusCotacaoUrl(url)) return 'arius-cotacao';
  if (isBluesoftCotacaoUrl(url)) return 'bluesoft-cotacao';
  if (isGuiaCotacaoUrl(url)) return 'guia-cotacao';
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

async function ensureHipcomerpMainWorld(tab) {
  if (isHipcomerpCotacaoUrl(tab?.url || '')) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['hipcom-main-world.js'],
        world: 'MAIN',
      });
      await sleep(120);
    } catch {}
  }
}

async function ensureAriusMainWorld(tab) {
  if (isAriusCotacaoUrl(tab?.url || '')) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['arius-main-world.js'],
        world: 'MAIN',
      });
      await sleep(120);
    } catch {}
  }
}

async function ensureBluesoftMainWorld(tab) {
  if (isBluesoftCotacaoUrl(tab?.url || '')) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['bluesoft-main-world.js'],
        world: 'MAIN',
      });
      await sleep(120);
    } catch {}
  }
}

async function ensureGuiaMainWorld(tab) {
  if (isGuiaCotacaoUrl(tab?.url || '')) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['guiacotacao-main-world.js'],
        world: 'MAIN',
      });
      await sleep(120);
    } catch {}
  }
}

async function ensureContentScript(tab) {
  await ensureHipcomerpMainWorld(tab);
  await ensureAriusMainWorld(tab);
  await ensureBluesoftMainWorld(tab);
  await ensureGuiaMainWorld(tab);
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

  await ensureHipcomerpMainWorld(tab);
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
      setStatus('Faça login no Venpro e deixe uma aba do painel aberta. Também reconheço o endereço antigo anota-ganha-app.web.app.', 'err');
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

function enrichPricesForFill(precos, items) {
  const itemsByIdx = new Map((items || []).map(item => [Number(item.idx), item]));
  return (precos || []).map(preco => {
    const item = itemsByIdx.get(Number(preco.idx));
    if (!item) return preco;
    return {
      ...preco,
      ean: item.ean || '',
      nome: item.nome || '',
      codigo: item.codigo || '',
      plu: item.plu || item.codigo || '',
      page: item.page || '',
      numeroCotacao: item.numeroCotacao || '',
      quantidadePorCaixa: item.quantidadePorCaixa || '',
      signature: item.signature || '',
      embalagem: item.embalagem || '',
      qtdEmbalagem: item.qtdEmbalagem || item.packageQty || '',
      idProduto: item.idProduto ?? '',
      produtoKey: item.produtoKey ?? '',
      produtoId: item.produtoId ?? '',
    };
  });
}

async function runJob(job, startBatch = 0, initial = {}) {
  running = true;
  cancelRequested = false;
  await storageSet({ processingJob: job });

  const token = await getToken();
  if (!token) throw new Error('Login expirado. Abra o painel do Venpro e tente de novo.');

  const totalBatches = Math.ceil(job.items.length / BATCH);
  const deferFillUntilEnd = job.site === 'cotacao-web-smus';
  const deferredPrices = Array.isArray(job.deferredPrices) ? [...job.deferredPrices] : [];
  let preenchidos = initial.preenchidos || 0;
  let naoEncontrados = initial.naoEncontrados || 0;
  let falhasPreenchimento = initial.falhas || 0;
  let processados = initial.processados || 0;
  let naoEncontradosDetalhes = Array.isArray(initial.naoEncontradosDetalhes)
    ? [...initial.naoEncontradosDetalhes]
    : Array.isArray(job.naoEncontradosDetalhes) ? [...job.naoEncontradosDetalhes] : [];
  let falhasDetalhes = Array.isArray(initial.falhasDetalhes)
    ? [...initial.falhasDetalhes]
    : Array.isArray(job.falhasDetalhes) ? [...job.falhasDetalhes] : [];

  for (let b = startBatch; b < totalBatches; b++) {
    if (cancelRequested) {
      await saveState({ status: 'paused', total: job.items.length, processados, preenchidos, naoEncontrados, falhas: falhasPreenchimento, naoEncontradosDetalhes, falhasDetalhes, pct: Math.round((b / totalBatches) * 100), batchIndex: b, ts: Date.now() });
      return;
    }

    const batch = job.items.slice(b * BATCH, (b + 1) * BATCH);
    const data = await matchBatch(token, job, batch, b + 1, totalBatches);
    const precos = Array.isArray(data.precos) ? data.precos : [];
    const batchMissingDetails = missingDetailsForBatch(batch, precos, data.mantidos);
    naoEncontradosDetalhes = mergeResultDetails(naoEncontradosDetalhes, batchMissingDetails);
    job.naoEncontradosDetalhes = naoEncontradosDetalhes;

    let filled = 0;
    let failedCount = 0;
    let batchFillDiagnostics = [];
    if (precos.length > 0) {
      const pricesToFill = enrichPricesForFill(precos, job.items);
      if (deferFillUntilEnd) {
        deferredPrices.push(...pricesToFill);
        job.deferredPrices = deferredPrices;
        await storageSet({ processingJob: job });
        filled = data.stats?.preenchidos || precos.length;
      } else {
        const fillResult = await sendToQuotationPage({
          action: 'fillPrices',
          prices: pricesToFill,
          empresaColuna: job.empresaColuna || 0,
        });
        filled = fillResult?.filled || 0;
        failedCount = Array.isArray(fillResult?.failed) ? fillResult.failed.length : 0;
        batchFillDiagnostics = fillDiagnosticLines(fillResult, pricesToFill);
        const batchFailureDetails = failureDetailsFromFill(fillResult, pricesToFill);
        falhasDetalhes = mergeResultDetails(falhasDetalhes, batchFailureDetails);
        job.falhasDetalhes = falhasDetalhes;
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
              nao_encontrados_detalhes: batchMissingDetails.slice(0, 20),
              falhas_detalhes: batchFailureDetails.slice(0, 20),
            },
            diagnostics: [
              ...(data.diagnostics || []),
              ...fillDiagnosticLines(fillResult, pricesToFill),
            ].slice(0, 20),
          });
          throw new Error('Encontrei preços, mas não consegui preencher os campos da cotação. Atualize a página e tente novamente.');
        }
      }
    }

    preenchidos += filled || data.stats?.preenchidos || 0;
    naoEncontrados += data.stats?.nao_encontrados || 0;
    if (!deferFillUntilEnd) falhasPreenchimento += failedCount;
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
      debug: {
        nao_encontrados_detalhes: batchMissingDetails.slice(0, 20),
      },
      diagnostics: [
        ...(data.diagnostics || []),
        ...batchFillDiagnostics,
      ].slice(0, 20),
    });

    const pct = Math.round(((b + 1) / totalBatches) * 100);
    await saveState({ status: 'processing', total: job.items.length, processados, preenchidos, naoEncontrados, falhas: falhasPreenchimento, naoEncontradosDetalhes, falhasDetalhes, pct, batchIndex: b + 1, ts: Date.now() });
  }

  if (deferFillUntilEnd && deferredPrices.length > 0) {
    setStatus(`Preenchendo ${deferredPrices.length} preços na Cotação Web SMUS...`, 'info');
    const fillResult = await sendToQuotationPage({
      action: 'fillPrices',
      prices: deferredPrices,
      empresaColuna: job.empresaColuna || 0,
    });
    const filled = fillResult?.filled || 0;
    const failedCount = Array.isArray(fillResult?.failed) ? fillResult.failed.length : 0;
    const smusFailureDetails = failureDetailsFromFill(fillResult, deferredPrices);
    falhasDetalhes = mergeResultDetails(falhasDetalhes, smusFailureDetails);
    job.falhasDetalhes = falhasDetalhes;

    await reportFill(token, {
      event_type: 'job_fill',
      status: filled > 0 ? 'success' : 'error',
      job_id: job.jobId,
      tabela_id: job.tabelaId,
      prazo: job.prazo,
      modo: job.modo,
      site: job.site,
      total_itens: job.items.length,
      batch_total: deferredPrices.length,
      precos_recebidos: deferredPrices.length,
      preenchidos: filled,
      falhas: failedCount,
      nao_encontrados: naoEncontrados,
      debug: {
        site_detectado: fillResult?.site || job.site,
        linhas_detectadas: fillResult?.rowCount || null,
        detalhes: Array.isArray(fillResult?.details) ? fillResult.details.slice(0, 30) : [],
        nao_encontrados_detalhes: naoEncontradosDetalhes.slice(0, 30),
        falhas_detalhes: smusFailureDetails.slice(0, 30),
      },
    });

    if (filled === 0) {
      throw new Error('Encontrei preços, mas não consegui preencher os campos da Cotação Web SMUS. Atualize a página e tente novamente.');
    }
    preenchidos = filled;
    falhasPreenchimento = failedCount;
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
    falhas: falhasPreenchimento,
    nao_encontrados: naoEncontrados,
    debug: {
      nao_encontrados_detalhes: naoEncontradosDetalhes.slice(0, 30),
      falhas_detalhes: falhasDetalhes.slice(0, 30),
    },
  });
  await saveState({ status: 'done', total: job.items.length, processados, preenchidos, naoEncontrados, falhas: falhasPreenchimento, naoEncontradosDetalhes, falhasDetalhes, pct: 100 });
  await storageRemove('processingJob');
}

function hipcomerpPageSignature(items = []) {
  return (items || [])
    .map(item => item.signature || `${item.codigo || ''}|${item.ean || ''}|${item.nome || ''}`)
    .filter(Boolean)
    .join('||');
}

async function extractOpenQuotationItems(empresaColuna) {
  const extractResult = await sendToQuotationPage({ action: 'extractItems', empresaColuna });
  const items = (extractResult.items || []).filter(item => (item.nome || item.ean) && (!item.filled || Number(item.current_price) > 0));
  return { ...extractResult, items };
}

async function saveHipcomerpStopState(message, state) {
  await saveState({
    status: 'error',
    msg: message,
    total: state.total || state.processados || 0,
    processados: state.processados || 0,
    preenchidos: state.preenchidos || 0,
    naoEncontrados: state.naoEncontrados || 0,
    falhas: state.falhas || 0,
    naoEncontradosDetalhes: state.naoEncontradosDetalhes || [],
    falhasDetalhes: state.falhasDetalhes || [],
    pct: state.pct || 0,
    ts: Date.now(),
  });
}

async function waitForHipcomerpApiReady(timeoutMs = 7000) {
  const startedAt = Date.now();
  let lastState = null;
  while (Date.now() - startedAt < timeoutMs) {
    const response = await sendToQuotationPage({ action: 'getHipcomerpApiState' });
    lastState = response || lastState;
    if (response?.ready) return response;
    await sleep(500);
  }
  return lastState || { ready: false };
}

async function ensureHipcomerpApiReady() {
  const state = await waitForHipcomerpApiReady(3500);
  if (state?.ready) return state;

  if (state?.usesCanvasKit) {
    throw new Error('Hipcomerp ainda não liberou os dados para a extensão. Não recarreguei a página para não derrubar o login. Abra a cotação, aguarde os itens aparecerem e clique em Preencher de novo. Se acabou de instalar a extensão nova, recarregue manualmente só depois de logar.');
  }

  throw new Error('Não consegui conectar com os dados da Hipcomerp. Abra a cotação logada, aguarde os itens aparecerem e tente novamente.');
}

async function runHipcomerpApiJob(job, initial = {}) {
  running = true;
  cancelRequested = false;
  job.site = 'hipcomerp-cotacao';
  job.hipcomerpMode = 'api';
  await storageSet({ processingJob: job });

  const token = await getToken();
  if (!token) throw new Error('Login expirado. Abra o painel do Venpro e tente de novo.');

  await ensureHipcomerpApiReady();
  setStatus('Hipcomerp: carregando todos os itens pela API do site...', 'info');
  const loadResult = await sendToQuotationPage({ action: 'loadHipcomerpApiItems', options: { waitMs: 6000 } });
  if (!loadResult?.ok) {
    throw new Error(loadResult?.reason === 'api_context_not_ready_canvas'
      ? 'Hipcomerp ainda não liberou os dados para a extensão. Não recarreguei a página para não derrubar o login. Aguarde os itens aparecerem e clique em Preencher de novo.'
      : `Não consegui carregar os itens da Hipcomerp (${loadResult?.reason || 'erro desconhecido'}).`);
  }

  const items = (loadResult.items || []).filter(item => (item.nome || item.ean) && (!item.filled || Number(item.current_price) > 0));
  job.items = items;
  job.hipcomerpPages = loadResult.pages || 1;
  job.hipcomerpTotal = loadResult.total || items.length;
  await storageSet({ processingJob: job });

  if (!items.length) {
    await saveState({
      status: 'done',
      total: 0,
      processados: 0,
      preenchidos: 0,
      naoEncontrados: 0,
      falhas: 0,
      pct: 100,
    });
    await storageRemove('processingJob');
    return;
  }

  const totalBatches = Math.ceil(items.length / BATCH);
  let preenchidos = initial.preenchidos || 0;
  let naoEncontrados = initial.naoEncontrados || 0;
  let falhasPreenchimento = initial.falhas || 0;
  let processados = initial.processados || 0;
  let naoEncontradosDetalhes = Array.isArray(initial.naoEncontradosDetalhes) ? [...initial.naoEncontradosDetalhes] : [];
  let falhasDetalhes = Array.isArray(initial.falhasDetalhes) ? [...initial.falhasDetalhes] : [];
  const startBatch = initial.batchIndex || 0;

  for (let b = startBatch; b < totalBatches; b++) {
    if (cancelRequested) {
      await saveState({
        status: 'paused',
        total: items.length,
        processados,
        preenchidos,
        naoEncontrados,
        falhas: falhasPreenchimento,
        naoEncontradosDetalhes,
        falhasDetalhes,
        pct: Math.round((b / totalBatches) * 100),
        batchIndex: b,
        ts: Date.now(),
      });
      return;
    }

    const batch = items.slice(b * BATCH, (b + 1) * BATCH);
    const pct = Math.round((b / totalBatches) * 100);
    setProgress(pct, `${processados} / ${items.length} itens`);
    setStatus(`Hipcomerp: buscando preços do lote ${b + 1}/${totalBatches}...`, 'info');

    const data = await matchBatch(token, job, batch, b + 1, totalBatches);
    const precos = Array.isArray(data.precos) ? data.precos : [];
    const missingDetails = missingDetailsForBatch(batch, precos, data.mantidos);
    const missingCount = missingDetails.length || Math.max(0, batch.length - precos.length);
    naoEncontradosDetalhes = mergeResultDetails(naoEncontradosDetalhes, missingDetails);
    naoEncontrados += missingCount;

    const pricesToSave = enrichPricesForFill(precos, batch);
    let savedCount = 0;
    let saveResult = { ok: true, saved: 0 };
    if (pricesToSave.length) {
      setStatus(`Hipcomerp: gravando ${pricesToSave.length} preço(s) no site...`, 'info');
      saveResult = await sendToQuotationPage({ action: 'saveHipcomerpApiPrices', prices: pricesToSave });
      savedCount = Number(saveResult?.saved || 0);
    }

    if (!saveResult?.ok || savedCount !== pricesToSave.length) {
      const failedCount = Math.max(1, pricesToSave.length - savedCount);
      falhasPreenchimento += failedCount;
      falhasDetalhes = mergeResultDetails(falhasDetalhes, pricesToSave.slice(savedCount).map(item => makeItemDetail(item, saveResult?.reason || 'falha_gravar_api')));
      await reportFill(token, {
        event_type: 'hipcomerp_api_batch',
        status: 'error',
        job_id: job.jobId,
        tabela_id: job.tabelaId,
        prazo: job.prazo,
        modo: job.modo,
        site: job.site,
        batch_index: b + 1,
        total_batches: totalBatches,
        total_itens: items.length,
        batch_total: batch.length,
        precos_recebidos: precos.length,
        preenchidos: savedCount,
        falhas: failedCount,
        nao_encontrados: missingCount,
        debug: {
          save_status: saveResult?.status || null,
          save_reason: saveResult?.reason || null,
          save_failed: saveResult?.failed || [],
          nao_encontrados_detalhes: missingDetails.slice(0, 30),
        },
      });
      await saveHipcomerpStopState('A Hipcomerp recusou parte dos preços encontrados. Parei sem tentar reenviar em loop.', {
        total: items.length,
        processados,
        preenchidos,
        naoEncontrados,
        falhas: falhasPreenchimento,
        naoEncontradosDetalhes,
        falhasDetalhes,
      });
      return;
    }

    preenchidos += savedCount;
    processados += batch.length;

    await reportFill(token, {
      event_type: 'hipcomerp_api_batch',
      status: 'success',
      job_id: job.jobId,
      tabela_id: job.tabelaId,
      prazo: job.prazo,
      modo: job.modo,
      site: job.site,
      batch_index: b + 1,
      total_batches: totalBatches,
      total_itens: items.length,
      batch_total: batch.length,
      precos_recebidos: precos.length,
      preenchidos: savedCount,
      falhas: 0,
      nao_encontrados: missingCount,
      debug: {
        hipcomerp_mode: 'api',
        nao_encontrados_detalhes: missingDetails.slice(0, 30),
      },
    });

    await saveState({
      status: 'processing',
      total: items.length,
      processados,
      preenchidos,
      naoEncontrados,
      falhas: falhasPreenchimento,
      naoEncontradosDetalhes,
      falhasDetalhes,
      pct: Math.round(((b + 1) / totalBatches) * 100),
      batchIndex: b + 1,
      ts: Date.now(),
    });
  }

  await reportFill(token, {
    event_type: 'job',
    status: 'done',
    job_id: job.jobId,
    tabela_id: job.tabelaId,
    prazo: job.prazo,
    modo: job.modo,
    site: job.site,
    total_itens: items.length,
    batch_total: items.length,
    preenchidos,
    falhas: falhasPreenchimento,
    nao_encontrados: naoEncontrados,
    debug: { hipcomerp_mode: 'api' },
  });

  await saveState({
    status: 'done',
    total: items.length,
    processados,
    preenchidos,
    naoEncontrados,
    falhas: falhasPreenchimento,
    naoEncontradosDetalhes,
    falhasDetalhes,
    pct: 100,
  });
  await storageRemove('processingJob');
}

async function runHipcomerpJob(job, initial = {}) {
  running = true;
  cancelRequested = false;
  await storageSet({ processingJob: job });

  const token = await getToken();
  if (!token) throw new Error('Login expirado. Abra o painel do Venpro e tente de novo.');

  let tela = initial.tela || 0;
  let preenchidos = initial.preenchidos || 0;
  let naoEncontrados = initial.naoEncontrados || 0;
  let falhasPreenchimento = initial.falhas || 0;
  let processados = initial.processados || 0;
  let naoEncontradosDetalhes = Array.isArray(initial.naoEncontradosDetalhes) ? [...initial.naoEncontradosDetalhes] : [];
  let falhasDetalhes = Array.isArray(initial.falhasDetalhes) ? [...initial.falhasDetalhes] : [];
  const seenPages = new Set(Array.isArray(initial.pageSignatures) ? initial.pageSignatures : []);
  const maxTelas = 300;

  while (tela < maxTelas) {
    if (cancelRequested) {
      await saveState({
        status: 'paused',
        total: processados,
        processados,
        preenchidos,
        naoEncontrados,
        falhas: falhasPreenchimento,
        naoEncontradosDetalhes,
        falhasDetalhes,
        pct: 0,
        tela,
        pageSignatures: Array.from(seenPages),
        ts: Date.now(),
      });
      return;
    }

    const extractResult = await extractOpenQuotationItems(job.empresaColuna || 0);
    const items = extractResult.items;
    const pageSignature = hipcomerpPageSignature(items);

    if (!items.length) {
      await saveState({
        status: 'done',
        total: processados,
        processados,
        preenchidos,
        naoEncontrados,
        falhas: falhasPreenchimento,
        naoEncontradosDetalhes,
        falhasDetalhes,
        pct: 100,
      });
      await storageRemove('processingJob');
      return;
    }

    if (pageSignature && seenPages.has(pageSignature)) {
      await saveHipcomerpStopState('A próxima tela não mudou depois de salvar. Parei para evitar repetir os mesmos itens.', {
        total: processados + items.length,
        processados,
        preenchidos,
        naoEncontrados,
        falhas: falhasPreenchimento,
        naoEncontradosDetalhes,
        falhasDetalhes,
      });
      return;
    }
    if (pageSignature) seenPages.add(pageSignature);

    job.items = items;
    job.pageSignatures = Array.from(seenPages);
    await storageSet({ processingJob: job });

    const telaNumero = tela + 1;
    setProgress(0, `Tela ${telaNumero}: ${items.length} itens visíveis`);
    setStatus(`Hipcomerp: buscando preços da tela ${telaNumero}...`, 'info');

    const data = await matchBatch(token, job, items, telaNumero, null);
    const precos = Array.isArray(data.precos) ? data.precos : [];
    const missingDetails = missingDetailsForBatch(items, precos, data.mantidos);
    const missingCount = missingDetails.length || Math.max(0, items.length - precos.length);
    naoEncontradosDetalhes = mergeResultDetails(naoEncontradosDetalhes, missingDetails);
    naoEncontrados += missingCount;

    setStatus(
      missingCount > 0
        ? `Hipcomerp: preenchendo ${precos.length} preço(s); ${missingCount} sem preço ficam zerado(s).`
        : `Hipcomerp: preenchendo ${precos.length} preço(s) da tela ${telaNumero}...`,
      'info'
    );
    const pricesToFill = enrichPricesForFill(precos, items);
    const fillResult = pricesToFill.length > 0
      ? await sendToQuotationPage({
        action: 'fillPrices',
        prices: pricesToFill,
        empresaColuna: job.empresaColuna || 0,
      })
      : { filled: 0, failed: [], details: [], site: job.site, rowCount: items.length };
    const filled = fillResult?.filled || 0;
    const failedCount = Array.isArray(fillResult?.failed) ? fillResult.failed.length : 0;
    const failureDetails = failureDetailsFromFill(fillResult, pricesToFill);
    falhasDetalhes = mergeResultDetails(falhasDetalhes, failureDetails);
    const fillFailures = failedCount || Math.max(0, pricesToFill.length - filled);

    if (filled !== pricesToFill.length || failedCount > 0) {
      falhasPreenchimento += fillFailures;
      await reportFill(token, {
        event_type: 'hipcomerp_page',
        status: 'error',
        job_id: job.jobId,
        tabela_id: job.tabelaId,
        prazo: job.prazo,
        modo: job.modo,
        site: job.site,
        batch_index: telaNumero,
        total_itens: processados + items.length,
        batch_total: items.length,
        precos_recebidos: precos.length,
        preenchidos: filled,
        falhas: fillFailures,
        nao_encontrados: missingCount,
        debug: {
          site_detectado: fillResult?.site || job.site,
          linhas_detectadas: fillResult?.rowCount || null,
          detalhes: Array.isArray(fillResult?.details) ? fillResult.details.slice(0, 30) : [],
          nao_encontrados_detalhes: missingDetails.slice(0, 30),
          falhas_detalhes: failureDetails.slice(0, 30),
        },
      });
      await saveHipcomerpStopState('Preço encontrado na tabela não entrou no campo da tela. Não cliquei em salvar.', {
        total: processados + items.length,
        processados,
        preenchidos,
        naoEncontrados,
        falhas: falhasPreenchimento,
        naoEncontradosDetalhes,
        falhasDetalhes,
      });
      return;
    }

    preenchidos += filled;
    processados += items.length;

    await reportFill(token, {
      event_type: 'hipcomerp_page',
      status: 'success',
      job_id: job.jobId,
      tabela_id: job.tabelaId,
      prazo: job.prazo,
      modo: job.modo,
      site: job.site,
      batch_index: telaNumero,
      total_itens: processados,
      batch_total: items.length,
      precos_recebidos: precos.length,
      preenchidos: filled,
      falhas: 0,
      nao_encontrados: missingCount,
      debug: {
        nao_encontrados_detalhes: missingDetails.slice(0, 30),
      },
    });

    await saveState({
      status: 'processing',
      total: processados,
      processados,
      preenchidos,
      naoEncontrados,
      falhas: falhasPreenchimento,
      naoEncontradosDetalhes,
      falhasDetalhes,
      pct: 0,
      tela: telaNumero,
      pageSignatures: Array.from(seenPages),
      ts: Date.now(),
    });

    setStatus(`Hipcomerp: tela ${telaNumero} preenchida. Salvando e carregando mais...`, 'info');
    const advanceResult = await sendToQuotationPage({ action: 'advanceHipcomerp' });
    if (!advanceResult?.ok) {
      await saveHipcomerpStopState(`Não consegui avançar no Hipcomerp (${advanceResult?.reason || 'erro desconhecido'}).`, {
        total: processados,
        processados,
        preenchidos,
        naoEncontrados,
        falhas: falhasPreenchimento,
        naoEncontradosDetalhes,
        falhasDetalhes,
      });
      return;
    }

    if (advanceResult.done) {
      await reportFill(token, {
        event_type: 'job',
        status: 'done',
        job_id: job.jobId,
        tabela_id: job.tabelaId,
        prazo: job.prazo,
        modo: job.modo,
        site: job.site,
        total_itens: processados,
        batch_total: processados,
        preenchidos,
        falhas: falhasPreenchimento,
        nao_encontrados: naoEncontrados,
        debug: { reason: advanceResult.reason || 'done' },
      });
      await saveState({
        status: 'done',
        total: processados,
        processados,
        preenchidos,
        naoEncontrados,
        falhas: falhasPreenchimento,
        naoEncontradosDetalhes,
        falhasDetalhes,
        pct: 100,
      });
      await storageRemove('processingJob');
      return;
    }

    tela++;
  }

  await saveHipcomerpStopState('Parei no limite de 300 telas para evitar loop infinito.', {
    total: processados,
    processados,
    preenchidos,
    naoEncontrados,
    falhas: falhasPreenchimento,
    naoEncontradosDetalhes,
    falhasDetalhes,
  });
}

async function saveEstanciaStopState(message, state) {
  await saveState({
    status: 'error',
    msg: message,
    total: state.total || state.processados || 0,
    processados: state.processados || 0,
    preenchidos: state.preenchidos || 0,
    naoEncontrados: state.naoEncontrados || 0,
    falhas: state.falhas || 0,
    naoEncontradosDetalhes: state.naoEncontradosDetalhes || [],
    falhasDetalhes: state.falhasDetalhes || [],
    pct: state.pct || 0,
    quoteIndex: state.quoteIndex || 0,
    page: state.page || 1,
    ts: Date.now(),
  });
}

function estanciaProgressPct(quoteIndex, quoteCount, page, pages) {
  const quotes = Math.max(1, quoteCount || 1);
  const currentPageRatio = Math.max(0, Math.min(1, ((page || 1) - 1) / Math.max(1, pages || 1)));
  return Math.max(0, Math.min(99, Math.round(((quoteIndex + currentPageRatio) / quotes) * 100)));
}

async function ensureEstanciaCotacaoOpen() {
  const result = await sendToQuotationPage({ action: 'openEstanciaCotacao' });
  if (!result?.ok) {
    throw new Error(`Não consegui abrir as cotações do Estância (${result?.reason || 'erro desconhecido'}).`);
  }
  return result.state || await sendToQuotationPage({ action: 'getEstanciaState' });
}

async function runEstanciaJob(job, initial = {}) {
  running = true;
  cancelRequested = false;
  await storageSet({ processingJob: job });

  const token = await getToken();
  if (!token) throw new Error('Login expirado. Abra o painel do Venpro e tente de novo.');

  let state = await ensureEstanciaCotacaoOpen();
  if (!state?.hasSelect || !state.quoteCount) {
    throw new Error('Não encontrei cotações disponíveis para esse fornecedor no Estância.');
  }

  const resumeQuoteIndex = Number.isInteger(Number(initial.quoteIndex))
    ? Number(initial.quoteIndex)
    : null;
  let quoteIndex = resumeQuoteIndex !== null
    ? resumeQuoteIndex
    : Math.max(0, state.quoteIndex || 0);
  let startPageForQuote = Number.isInteger(Number(initial.page)) ? Math.max(1, Number(initial.page)) : 1;
  let preenchidos = initial.preenchidos || 0;
  let naoEncontrados = initial.naoEncontrados || 0;
  let falhasPreenchimento = initial.falhas || 0;
  let processados = initial.processados || 0;
  let naoEncontradosDetalhes = Array.isArray(initial.naoEncontradosDetalhes) ? [...initial.naoEncontradosDetalhes] : [];
  let falhasDetalhes = Array.isArray(initial.falhasDetalhes) ? [...initial.falhasDetalhes] : [];
  const quoteCount = state.quoteCount;

  for (; quoteIndex < quoteCount; quoteIndex++) {
    if (cancelRequested) {
      await saveState({
        status: 'paused',
        total: processados,
        processados,
        preenchidos,
        naoEncontrados,
        falhas: falhasPreenchimento,
        naoEncontradosDetalhes,
        falhasDetalhes,
        pct: estanciaProgressPct(quoteIndex, quoteCount, 1, 1),
        quoteIndex,
        page: startPageForQuote,
        ts: Date.now(),
      });
      return;
    }

    state = await sendToQuotationPage({ action: 'getEstanciaState' });
    if (state.quoteIndex !== quoteIndex) {
      const loadedQuote = await sendToQuotationPage({ action: 'loadEstanciaQuote', quoteIndex });
      if (!loadedQuote?.ok) {
        await saveEstanciaStopState(`Não consegui abrir a cotação ${quoteIndex + 1} no Estância (${loadedQuote?.reason || 'erro desconhecido'}).`, {
          processados, preenchidos, naoEncontrados, falhas: falhasPreenchimento, naoEncontradosDetalhes, falhasDetalhes, quoteIndex,
        });
        return;
      }
      state = loadedQuote.state || await sendToQuotationPage({ action: 'getEstanciaState' });
    }

    let page = quoteIndex === resumeQuoteIndex ? startPageForQuote : 1;
    let pages = Math.max(1, state.pages || 1);
    for (; page <= pages; page++) {
      if (cancelRequested) {
        await saveState({
          status: 'paused',
          total: processados,
          processados,
          preenchidos,
          naoEncontrados,
          falhas: falhasPreenchimento,
          naoEncontradosDetalhes,
          falhasDetalhes,
          pct: estanciaProgressPct(quoteIndex, quoteCount, page, pages),
          quoteIndex,
          page,
          ts: Date.now(),
        });
        return;
      }

      state = await sendToQuotationPage({ action: 'getEstanciaState' });
      pages = Math.max(1, state.pages || pages || 1);
      if (state.page !== page) {
        const loadedPage = await sendToQuotationPage({ action: 'loadEstanciaPage', page });
        if (!loadedPage?.ok) {
          await saveEstanciaStopState(`Não consegui abrir a página ${page} da cotação Estância (${loadedPage?.reason || 'erro desconhecido'}).`, {
            processados, preenchidos, naoEncontrados, falhas: falhasPreenchimento, naoEncontradosDetalhes, falhasDetalhes, quoteIndex, page,
          });
          return;
        }
        state = loadedPage.state || await sendToQuotationPage({ action: 'getEstanciaState' });
        pages = Math.max(1, state.pages || pages || 1);
      }

      const quoteLabel = state.quoteText || `Cotação ${quoteIndex + 1}`;
      const extractResult = await extractOpenQuotationItems(job.empresaColuna || 0);
      const items = extractResult.items;
      if (!items.length) {
        setStatus(`Estância: sem itens na ${quoteLabel}, página ${page}.`, 'info');
        continue;
      }

      const pct = estanciaProgressPct(quoteIndex, quoteCount, page, pages);
      setProgress(pct, `Estância ${quoteIndex + 1}/${quoteCount} · pág. ${page}/${pages} · ${items.length} itens`);
      setStatus(`Estância: buscando preços da ${quoteLabel}, página ${page}/${pages}...`, 'info');

      job.items = items;
      job.site = 'estancia-cotacao';
      await storageSet({ processingJob: job });

      const data = await matchBatch(token, job, items, page, pages);
      const precos = Array.isArray(data.precos) ? data.precos : [];
      const missingDetails = missingDetailsForBatch(items, precos, data.mantidos);
      const missingCount = missingDetails.length || Math.max(0, items.length - precos.length);
      naoEncontradosDetalhes = mergeResultDetails(naoEncontradosDetalhes, missingDetails);
      naoEncontrados += missingCount;

      const pricesToFill = enrichPricesForFill(precos, items);
      setStatus(
        missingCount > 0
          ? `Estância: preenchendo ${precos.length} preço(s); ${missingCount} sem preço ficam 0,00.`
          : `Estância: preenchendo ${precos.length} preço(s) e campos fixos...`,
        'info'
      );

      const fillResult = await sendToQuotationPage({
        action: 'fillPrices',
        prices: pricesToFill,
        empresaColuna: job.empresaColuna || 0,
      });
      const filled = fillResult?.filled || 0;
      const failedCount = Array.isArray(fillResult?.failed) ? fillResult.failed.length : 0;
      const failureDetails = failureDetailsFromFill(fillResult, pricesToFill);
      const fixedFailures = (fillResult?.details || []).filter(detail => /fixed_fields/.test(detail?.reason || ''));
      falhasDetalhes = mergeResultDetails(falhasDetalhes, [...failureDetails, ...fixedFailures]);
      const fillFailures = failedCount || Math.max(0, pricesToFill.length - filled) || fixedFailures.length;

      if (fillFailures > 0) {
        falhasPreenchimento += fillFailures;
        await reportFill(token, {
          event_type: 'estancia_page',
          status: 'error',
          job_id: job.jobId,
          tabela_id: job.tabelaId,
          prazo: job.prazo,
          modo: job.modo,
          site: 'estancia-cotacao',
          batch_index: page,
          total_batches: pages,
          total_itens: processados + items.length,
          batch_total: items.length,
          precos_recebidos: precos.length,
          preenchidos: filled,
          falhas: fillFailures,
          nao_encontrados: missingCount,
          debug: {
            quote_index: quoteIndex,
            quote_text: quoteLabel,
            detalhes: Array.isArray(fillResult?.details) ? fillResult.details.slice(0, 30) : [],
            nao_encontrados_detalhes: missingDetails.slice(0, 30),
            falhas_detalhes: falhasDetalhes.slice(0, 30),
          },
        });
        await saveEstanciaStopState('Preço ou campo fixo não entrou no Estância. Não cliquei em gravar alterações.', {
          total: processados + items.length,
          processados,
          preenchidos,
          naoEncontrados,
          falhas: falhasPreenchimento,
          naoEncontradosDetalhes,
          falhasDetalhes,
          quoteIndex,
          page,
          pct,
        });
        return;
      }

      const saveResult = await sendToQuotationPage({ action: 'saveEstanciaPage' });
      if (!saveResult?.ok) {
        await saveEstanciaStopState(`Não consegui gravar a página do Estância (${saveResult?.reason || 'erro desconhecido'}).`, {
          total: processados + items.length,
          processados,
          preenchidos,
          naoEncontrados,
          falhas: falhasPreenchimento,
          naoEncontradosDetalhes,
          falhasDetalhes,
          quoteIndex,
          page,
          pct,
        });
        return;
      }

      preenchidos += filled;
      processados += items.length;

      await reportFill(token, {
        event_type: 'estancia_page',
        status: 'success',
        job_id: job.jobId,
        tabela_id: job.tabelaId,
        prazo: job.prazo,
        modo: job.modo,
        site: 'estancia-cotacao',
        batch_index: page,
        total_batches: pages,
        total_itens: processados,
        batch_total: items.length,
        precos_recebidos: precos.length,
        preenchidos: filled,
        falhas: 0,
        nao_encontrados: missingCount,
        debug: {
          quote_index: quoteIndex,
          quote_text: quoteLabel,
          nao_encontrados_detalhes: missingDetails.slice(0, 30),
        },
      });

      await saveState({
        status: 'processing',
        total: processados,
        processados,
        preenchidos,
        naoEncontrados,
        falhas: falhasPreenchimento,
        naoEncontradosDetalhes,
        falhasDetalhes,
        pct,
        quoteIndex,
        page: page + 1,
        ts: Date.now(),
      });

      if (page < pages) {
        setStatus(`Estância: página ${page} gravada. Abrindo página ${page + 1}...`, 'info');
        const nextPage = await sendToQuotationPage({ action: 'loadEstanciaPage', page: page + 1 });
        if (!nextPage?.ok) {
          await saveEstanciaStopState(`Página ${page} gravada, mas não consegui abrir a próxima (${nextPage?.reason || 'erro desconhecido'}).`, {
            total: processados,
            processados,
            preenchidos,
            naoEncontrados,
            falhas: falhasPreenchimento,
            naoEncontradosDetalhes,
            falhasDetalhes,
            quoteIndex,
            page: page + 1,
            pct,
          });
          return;
        }
      }
    }

    startPageForQuote = 1;
    if (quoteIndex + 1 < quoteCount) {
      setStatus(`Estância: cotação ${quoteIndex + 1}/${quoteCount} concluída. Abrindo próxima cotação...`, 'info');
      const nextQuote = await sendToQuotationPage({ action: 'loadEstanciaQuote', quoteIndex: quoteIndex + 1 });
      if (!nextQuote?.ok) {
        await saveEstanciaStopState(`Cotação atual gravada, mas não consegui abrir a próxima (${nextQuote?.reason || 'erro desconhecido'}).`, {
          total: processados,
          processados,
          preenchidos,
          naoEncontrados,
          falhas: falhasPreenchimento,
          naoEncontradosDetalhes,
          falhasDetalhes,
          quoteIndex: quoteIndex + 1,
          page: 1,
          pct: estanciaProgressPct(quoteIndex + 1, quoteCount, 1, 1),
        });
        return;
      }
    }
  }

  await reportFill(token, {
    event_type: 'job',
    status: 'done',
    job_id: job.jobId,
    tabela_id: job.tabelaId,
    prazo: job.prazo,
    modo: job.modo,
    site: 'estancia-cotacao',
    total_itens: processados,
    batch_total: processados,
    preenchidos,
    falhas: falhasPreenchimento,
    nao_encontrados: naoEncontrados,
  });

  await saveState({
    status: 'done',
    total: processados,
    processados,
    preenchidos,
    naoEncontrados,
    falhas: falhasPreenchimento,
    naoEncontradosDetalhes,
    falhasDetalhes,
    pct: 100,
  });
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
    const siteFromUrl = detectSiteFromUrl(tab?.url || '');
    if (siteFromUrl === 'estancia-cotacao') {
      setStatus('Abrindo lista de cotações do Estância...', 'info');
      await ensureEstanciaCotacaoOpen();
    }
    if (siteFromUrl === 'hipcomerp-cotacao') {
      const apiState = await sendToQuotationPage({ action: 'getHipcomerpApiState' });
      if (apiState?.ready || apiState?.usesCanvasKit) {
        await storageRemove(['processingState', 'processingJob']);
        const job = { jobId: createJobId(), items: [], tabelaId, prazo, modo, empresaColuna, site: 'hipcomerp-cotacao', hipcomerpMode: 'api' };
        setProgress(0, 'Hipcomerp: preparando itens');
        showRunning();
        await runHipcomerpApiJob(job);
        return;
      }
    }
    const extractResult = await sendToQuotationPage({ action: 'extractItems', empresaColuna });
    const site = extractResult.site || detectSiteFromUrl(tab?.url || '');
    const items = (extractResult.items || []).filter(item => (item.nome || item.ean) && (!item.filled || Number(item.current_price) > 0));

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
    if (site === 'hipcomerp-cotacao') {
      setStatus(`Hipcomerp: iniciando com ${items.length} itens visíveis...`, 'info');
      await runHipcomerpJob(job);
    } else if (site === 'estancia-cotacao') {
      setStatus(`Estância: iniciando com ${items.length} itens na página atual...`, 'info');
      await runEstanciaJob(job);
    } else {
      setStatus(`Processando ${items.length} itens...`, 'info');
      await runJob(job);
    }
  } catch (err) {
    await saveState({ status: 'error', msg: err.message || 'Erro ao preencher cotação', total: 0, processados: 0, preenchidos: 0, naoEncontrados: 0, falhas: 0, pct: 0, ts: Date.now() });
  }
}

async function resumeProcessing() {
  const data = await storageGet(['processingJob', 'processingState']);
  const job = data.processingJob;
  const state = data.processingState || {};
  if (!job || (job.site !== 'hipcomerp-cotacao' && job.site !== 'estancia-cotacao' && !job.items?.length)) {
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
    if (job.site === 'hipcomerp-cotacao') {
      if (job.hipcomerpMode === 'api') {
        await runHipcomerpApiJob(job, {
          batchIndex: state.batchIndex || 0,
          preenchidos: state.preenchidos || 0,
          naoEncontrados: state.naoEncontrados || 0,
          falhas: state.falhas || 0,
          processados: state.processados || 0,
          naoEncontradosDetalhes: state.naoEncontradosDetalhes || [],
          falhasDetalhes: state.falhasDetalhes || [],
        });
      } else {
        await runHipcomerpJob(job, {
          tela: state.tela || 0,
          preenchidos: state.preenchidos || 0,
          naoEncontrados: state.naoEncontrados || 0,
          falhas: state.falhas || 0,
          processados: state.processados || 0,
          naoEncontradosDetalhes: state.naoEncontradosDetalhes || [],
          falhasDetalhes: state.falhasDetalhes || [],
          pageSignatures: state.pageSignatures || job.pageSignatures || [],
        });
      }
    } else if (job.site === 'estancia-cotacao') {
      await runEstanciaJob(job, {
        quoteIndex: state.quoteIndex || 0,
        page: state.page || 1,
        preenchidos: state.preenchidos || 0,
        naoEncontrados: state.naoEncontrados || 0,
        falhas: state.falhas || 0,
        processados: state.processados || 0,
        naoEncontradosDetalhes: state.naoEncontradosDetalhes || [],
        falhasDetalhes: state.falhasDetalhes || [],
      });
    } else {
      await runJob(job, state.batchIndex || 0, {
        preenchidos: state.preenchidos || 0,
        naoEncontrados: state.naoEncontrados || 0,
        falhas: state.falhas || 0,
        processados: state.processados || 0,
        naoEncontradosDetalhes: state.naoEncontradosDetalhes || [],
        falhasDetalhes: state.falhasDetalhes || [],
      });
    }
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
