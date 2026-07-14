// Content script — runs on supported quotation pages.

const cotacaoWebSmusPriceCellMeta = new WeakMap();
const bubbleCatalogRowMeta = new WeakMap();
const hipcomerpRowMeta = new WeakMap();
const easyCotacaoRowMeta = new WeakMap();
const estanciaRowMeta = new WeakMap();
const HIPCOMERP_BRIDGE_VERSION = '1.0.54';
const hipcomerpApiState = {
  ready: false,
  baseCaptured: false,
  bridgeVersion: '',
  fornecedor: '',
  loja: '',
  numeroCotacao: '',
  limit: 20,
  hasAuth: false,
  pages: new Map(),
  total: 0,
  lastSeenAt: 0,
  pending: new Map(),
};

document.addEventListener('venpro:hipcom-api-captured', event => {
  rememberHipcomerpApiCapture(event.detail || {});
});

document.addEventListener('venpro:hipcom-api-command-result', event => {
  resolveHipcomerpApiCommand(event.detail || {});
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.action === 'extractItems') {
      const site = detectQuotationSite();
      const items = await extractQuotationItems({ empresaColuna: msg.empresaColuna });
      return { items, site };
    }
    if (msg.action === 'fillPrices') {
      return fillQuotationPrices(msg.prices, { empresaColuna: msg.empresaColuna });
    }
    if (msg.action === 'advanceHipcomerp') {
      return advanceHipcomerpPage();
    }
    if (msg.action === 'getHipcomerpApiState') {
      return getHipcomerpApiStateLive();
    }
    if (msg.action === 'loadHipcomerpApiItems') {
      return loadHipcomerpApiItems(msg.options || {});
    }
    if (msg.action === 'saveHipcomerpApiPrices') {
      return saveHipcomerpApiPrices(msg.prices || []);
    }
    if (msg.action === 'openEstanciaCotacao') {
      return openEstanciaCotacaoPage();
    }
    if (msg.action === 'saveEstanciaPage') {
      return saveEstanciaPage();
    }
    if (msg.action === 'loadEstanciaPage') {
      return loadEstanciaPage(msg.page);
    }
    if (msg.action === 'loadEstanciaQuote') {
      return loadEstanciaQuote(msg.quoteIndex);
    }
    if (msg.action === 'getEstanciaState') {
      return getEstanciaState();
    }
    if (msg.action === 'detectSite') {
      const site = detectQuotationSite();
      const rows = getQuotationRows(site);
      return { site, supported: site !== 'generic' || rows.length > 0, rowCount: rows.length };
    }
    return null;
  })()
    .then(response => sendResponse(response))
    .catch(err => sendResponse({ ok: false, error: err?.message || String(err || 'Erro na extensão') }));
  return true; // keep channel open for async
});

function normalizeEmpresaColuna(value) {
  const index = Number.parseInt(value, 10);
  return Number.isInteger(index) && index >= 0 && index <= 4 ? index : 0;
}

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

function getEditableInputs(row) {
  return Array.from(row.querySelectorAll('input:not([type]), input[type="text"], input[type="number"], input[type="tel"]'))
    .filter(input => !input.disabled && !input.readOnly && isVisible(input));
}

function getEditableControls(root) {
  const self = isEditableValueControl(root) && !root.disabled && !root.readOnly && isVisible(root) ? [root] : [];
  const inputs = getEditableInputs(root);
  const editable = Array.from(root.querySelectorAll('[contenteditable="true"], [role="textbox"]'))
    .filter(el => isVisible(el));
  return [...self, ...inputs, ...editable].filter((el, index, all) => all.indexOf(el) === index);
}

function getBubbleCatalogEditableControls(root) {
  const unsafeTypes = /^(hidden|button|submit|reset|checkbox|radio|file|image|password)$/i;
  const self = isEditableValueControl(root)
    && !(root.tagName === 'INPUT' && unsafeTypes.test(String(root.getAttribute('type') || '').toLowerCase()))
    && !root.disabled
    && !root.readOnly
    && isVisible(root)
    ? [root]
    : [];
  const inputs = Array.from(root.querySelectorAll('input, textarea'))
    .filter(input => !input.disabled && !input.readOnly && isVisible(input))
    .filter(input => !unsafeTypes.test(String(input.getAttribute('type') || '').toLowerCase()));
  const editable = Array.from(root.querySelectorAll('[contenteditable="true"], [role="textbox"]'))
    .filter(el => isVisible(el));
  return [...self, ...inputs, ...editable].filter((el, index, all) => all.indexOf(el) === index);
}

function isPriceLikeInput(input) {
  const meta = `${input.name || ''} ${input.id || ''} ${input.className || ''} ${input.placeholder || ''}`.toLowerCase();
  return /(preco|preço|valor|vlr|cotacao|cotação|unit)/.test(meta);
}

function normalizeCellText(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeLooseText(value) {
  return normalizeCellText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function elementDirectText(el) {
  return Array.from(el?.childNodes || [])
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent || '')
    .join(' ');
}

function elementLeafText(el) {
  const direct = normalizeCellText(elementDirectText(el));
  if (direct) return direct;
  const visibleChildren = Array.from(el?.children || []).filter(isVisible);
  if (visibleChildren.length > 0) return '';
  return normalizeCellText(el?.textContent || '');
}

function rectCenterX(rect) {
  return rect.left + rect.width / 2;
}

function rectCenterY(rect) {
  return rect.top + rect.height / 2;
}

function limparEAN(s) {
  s = String(s || '').trim().replace(/\u00a0/g, ' ').replace(/^\s*['"]|['"]\s*$/g, '');
  if (!s || /^(nan|null|undefined)$/i.test(s)) return '';

  const compact = s.replace(/\s+/g, '').replace(',', '.');
  if (/^[+-]?\d+(\.\d+)?([eE][+\-]?\d+)?$/.test(compact)) {
    try {
      const parsed = String(Math.trunc(Number(compact)));
      if (/^\d{8,14}$/.test(parsed)) return parsed;
    } catch {}
  }

  const digits = s.replace(/\D/g, '');
  if (/^\d{8,14}$/.test(digits)) return digits;

  const match = s.match(/\d{8,14}/);
  return match ? match[0] : '';
}

function getControlValue(input) {
  if (input && 'value' in input) return String(input.value || '');
  return String(input?.textContent || '');
}

function isEditableValueControl(el) {
  return Boolean(el && (
    'value' in el
    || el.isContentEditable
    || el.getAttribute?.('role') === 'textbox'
  ));
}

function getDirectCells(row) {
  return Array.from(row.children).filter(el => /^(td|th)$/i.test(el.tagName));
}

function findColumnIndexByHeader(row, includePatterns, excludePatterns = []) {
  const table = row.closest('table');
  if (!table) return -1;

  const tableRows = Array.from(table.querySelectorAll('tr'));
  const rowIndex = tableRows.indexOf(row);
  const headerRows = rowIndex >= 0 ? tableRows.slice(0, rowIndex).reverse() : tableRows.reverse();

  for (const headerRow of headerRows) {
    const headerCells = getDirectCells(headerRow);
    if (!headerCells.length) continue;

    for (let i = 0; i < headerCells.length; i++) {
      const text = normalizeCellText(headerCells[i].textContent);
      if (!text) continue;
      if (!includePatterns.some(pattern => pattern.test(text))) continue;
      if (excludePatterns.some(pattern => pattern.test(text))) continue;
      return i;
    }
  }

  return -1;
}

function getCellColSpan(cell) {
  const span = Number.parseInt(cell?.getAttribute?.('colspan') || '1', 10);
  return Number.isInteger(span) && span > 0 ? span : 1;
}

function getCellAtVisualColumn(row, visualIndex) {
  if (!Number.isInteger(visualIndex) || visualIndex < 0) return null;
  let current = 0;
  for (const cell of getDirectCells(row)) {
    const span = getCellColSpan(cell);
    if (visualIndex >= current && visualIndex < current + span) return cell;
    current += span;
  }
  return null;
}

function findVisualColumnIndexByHeader(row, includePatterns, excludePatterns = []) {
  const table = row.closest('table');
  if (!table) return -1;

  const tableRows = Array.from(table.querySelectorAll('tr'));
  const rowIndex = tableRows.indexOf(row);
  const headerRows = rowIndex >= 0 ? tableRows.slice(0, rowIndex).reverse() : tableRows.reverse();

  for (const headerRow of headerRows) {
    const headerCells = getDirectCells(headerRow);
    if (!headerCells.length) continue;

    let visualIndex = 0;
    for (const cell of headerCells) {
      const text = normalizeCellText(cell.textContent);
      const span = getCellColSpan(cell);
      if (text
        && includePatterns.some(pattern => pattern.test(text))
        && !excludePatterns.some(pattern => pattern.test(text))) {
        return visualIndex;
      }
      visualIndex += span;
    }
  }

  return -1;
}

function markCotacaoWebSmusPriceCell(cell, confidence, reason) {
  if (cell) cotacaoWebSmusPriceCellMeta.set(cell, { confidence, reason });
  return cell;
}

function isSafeCotacaoWebSmusRawTarget(cell) {
  const meta = cotacaoWebSmusPriceCellMeta.get(cell);
  return Boolean(meta && meta.confidence >= 80);
}

function getCellTextByHeader(row, includePatterns, excludePatterns = []) {
  const index = findColumnIndexByHeader(row, includePatterns, excludePatterns);
  if (index < 0) return '';
  return normalizeCellText(getDirectCells(row)[index]?.textContent || '');
}

function extractEANFromRow(row, site) {
  const headerEAN = limparEAN(getCellTextByHeader(row, [
    /^\s*EAN\s*$/i,
    /\bGTIN\b/i,
    /cod\.?\s*barras/i,
    /c[oó]digo\s+(de\s+)?barras/i,
    /barcode/i,
  ]));
  if (headerEAN) return headerEAN;

  if (site === 'intersolid-cotacao' || site === 'cotacao-web-smus') {
    for (const td of row.querySelectorAll('td')) {
      const v = limparEAN(td.textContent);
      if (/^\d{12,14}$/.test(v)) return v;
    }
  }

  for (const inp of row.querySelectorAll('input[type="hidden"]')) {
    const meta = `${inp.name || ''} ${inp.id || ''} ${inp.className || ''}`.toLowerCase();
    if (!/(ean|gtin|barra|barcode|codbar|cod_barr|codbarra)/.test(meta)) continue;
    const v = limparEAN(inp.value);
    if (v) return v;
  }
  const dataAttrs = ['data-ean','data-gtin','data-barcode','data-codbar','data-codbarra','data-cod-barras','data-codigo-barras'];
  for (const attr of dataAttrs) {
    const v = limparEAN(row.getAttribute(attr));
    if (v) return v;
    for (const td of row.querySelectorAll('td')) {
      const v2 = limparEAN(td.getAttribute(attr));
      if (v2) return v2;
    }
  }
  // Sem cabeçalho/metadado, códigos internos de 8-11 dígitos são ambíguos.
  // O fallback visual aceita apenas GTIN-12/13/14; EAN-8 continua aceito quando
  // a coluna ou o atributo identifica explicitamente o valor como EAN.
  for (const td of row.querySelectorAll('td')) {
    const txt = limparEAN(td.textContent);
    if (/^\d{12,14}$/.test(txt)) return txt;
  }
  const fullText = row.textContent.trim();
  const m = fullText.match(/\d{12,14}/);
  return m ? m[0] : null;
}

function extractProductNameFromRow(row) {
  const cells = row.querySelectorAll('td');
  const cellTexts = [];
  for (const td of cells) {
    cellTexts.push(td.textContent.trim());
  }

  for (const txt of cellTexts) {
    const t = txt.trim();
    if (t.length < 4) continue;
    if (limparEAN(t)) continue;
    if (/^[\d.,\s]+$/.test(t)) continue;
    if (/^(FD|CX|R\$|\d+\s*(UN|CX|PC|KG|G|ML|L))$/i.test(t)) continue;
    if (/[A-Za-zÀ-ú]{3}/.test(t)) {
      return t.replace(/(CX|FD)\d+R?\$?\s*$/i, '').trim();
    }
  }
  return '';
}

function isFilledPriceValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const normalized = raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0;
}

function currentPriceValue(control) {
  return control ? parsePositivePriceNumber(getControlValue(control).trim()) : null;
}

function getCotacaoWebSmusCodigo(row) {
  const byHeader = normalizeCellText(getCellTextByHeader(row, [/^\s*c[oó]digo\s*$/i, /^\s*c[oó]d\.?\s*$/i]));
  if (byHeader && /^\d{2,10}$/.test(byHeader.replace(/\D/g, ''))) return byHeader.replace(/\D/g, '');

  const firstCell = normalizeCellText(getDirectCells(row)[0]?.textContent || '');
  const digits = firstCell.replace(/\D/g, '');
  return /^\d{2,10}$/.test(digits) ? digits : '';
}

function normalizeRowKey(value) {
  return normalizeCellText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function getCotacaoWebSmusRowSignature(row) {
  const codigo = getCotacaoWebSmusCodigo(row);
  const ean = extractEANFromRow(row, 'cotacao-web-smus') || '';
  const nome = normalizeRowKey(extractProductNameFromRow(row));
  return `${codigo}|${ean}|${nome}`;
}

function isCotacaoWebSmusProductRow(row) {
  const text = row.textContent || '';
  const signature = getCotacaoWebSmusRowSignature(row);
  return Boolean(signature && signature !== '||')
    && /\d{8,14}/.test(text)
    && /[A-Za-zÀ-ú]{3}/.test(text);
}

function isBubbleCatalogFornecedorPage(hostname = window.location.hostname || '', path = window.location.pathname || '', bodyText = document.body?.innerText || '') {
  if (!/^catalog-32594\.bubbleapps\.io$/i.test(hostname)) return false;
  const loose = normalizeLooseText(bodyText);
  return /(^|\/)fornecedor\/?$/i.test(path)
    || (loose.includes('itens para cotacao')
      && /\bcod\b/.test(loose)
      && loose.includes('produto')
      && loose.includes('fracionamento')
      && loose.includes('valor'));
}

function isHipcomerpCotacaoPage(hostname = window.location.hostname || '', bodyText = document.body?.innerText || '') {
  if (!/(^|\.)cotacao\.hipcomerp\.com\.br$/i.test(hostname)) return false;
  const route = `${window.location.pathname || ''}${window.location.hash || ''}`;
  if (/#\/?app\/(?:oferta|cotacoes|cotacao)/i.test(route) || hipcomerpUsesCanvasKit()) return true;
  const loose = normalizeLooseText(bodyText);
  return loose.includes('fornecedor')
    && loose.includes('digitados')
    && loose.includes('cotacao')
    && (loose.includes('preco p/ unidade') || loose.includes('preco p unidade'));
}

function isEasyCotacaoWebPage(hostname = window.location.hostname || '', path = window.location.pathname || '', bodyText = document.body?.innerText || '') {
  const loose = normalizeLooseText(bodyText);
  const urlText = normalizeLooseText(`${hostname}${path}${window.location.hash || ''}`);
  return urlText.includes('easycotacao')
    || loose.includes('easy - cotacao web')
    || (loose.includes('salvar cotacao')
      && (loose.includes('qtd. emb') || loose.includes('qtd emb'))
      && loose.includes('preco')
      && loose.includes('similar'));
}

function isEstanciaCotacaoPage(hostname = window.location.hostname || '', path = window.location.pathname || '', bodyText = document.body?.innerText || '') {
  if (!/(^|\.)cotacao\.estanciasupermercados\.com\.br$/i.test(hostname)) return false;
  const loose = normalizeLooseText(bodyText);
  return /\/(home|cotacao)\.asp$/i.test(path)
    || (loose.includes('cotacoes')
      && loose.includes('qtd disponivel')
      && loose.includes('referencia')
      && loose.includes('valor da embalagem'));
}

function isSgCotacaoPage(hostname = window.location.hostname || '', bodyText = document.body?.innerText || '') {
  if (/(^|\.)cotacao\.sghost\.com\.br$/i.test(hostname)) return true;
  const loose = normalizeLooseText(bodyText);
  return loose.includes('sg cotacao')
    || (loose.includes('preco un. (r$)')
      && loose.includes('cod. barra')
      && loose.includes('qtde. emb'));
}

function getSgCotacaoCell(row, label) {
  return row.querySelector?.(`td[data-label="${label}"]`) || null;
}

function getSgCotacaoEan(row) {
  const cell = getSgCotacaoCell(row, 'Cod. Barra');
  return cell ? limparEAN(cell.textContent || '') : '';
}

function getSgCotacaoPriceCandidates(row) {
  // Preço unitário: input id "<índice>-preco" dentro do td "Preço Un. (R$)".
  // O de embalagem termina em -precoEmb e o desconto em -percDesc, então
  // [id$="-preco"] não colide com eles.
  const scoped = Array.from(row.querySelectorAll('td[data-label="Preço Un. (R$)"] input'));
  const byId = Array.from(row.querySelectorAll('input[id$="-preco"]'));
  const inputs = scoped.length ? scoped : byId;
  return inputs.filter(input => !input.disabled && !input.readOnly && isVisible(input));
}

function isSgCotacaoProductRow(row) {
  if (!row.querySelector?.('td[data-label="Preço Un. (R$)"] input, input[id$="-preco"]')) return false;
  return Boolean(getSgCotacaoEan(row) || normalizeCellText(getSgCotacaoCell(row, 'Produto')?.textContent || ''));
}

function getSgCotacaoRows() {
  return Array.from(document.querySelectorAll('tr')).filter(isSgCotacaoProductRow);
}

function sgCotacaoRowShowsPrice(row, expectedPrice, samePriceLike) {
  const inputs = Array.from(row.querySelectorAll('td[data-label="Preço Un. (R$)"] input, input[id$="-preco"]'));
  return inputs.some(input => samePriceLike(getControlValue(input), expectedPrice));
}

// HR Cotação (cotacao.hrtech.com.br): SPA Angular 8, tabela CDK com colunas
// td.cdk-column-{codigoPlu,ean,ref,descricao,qtd,preco,total,status}. O input
// de preço (input.ipt-price, type=tel, id = codigoPlu) usa máscara própria que
// só constrói o valor por keydown confiável — mas o commit/salvamento lê
// input.value cru no handler (keydown)="onKeyPressEvent" (Enter/Tab/Setas).
// Então escrevemos o value nativo e disparamos um keydown "Tab" sintético para
// forçar inputDown -> updateVlr(input.value) que salva no backend.
function isHrCotacaoPage(hostname = window.location.hostname || '') {
  if (/(^|\.)cotacao\.hrtech\.com\.br$/i.test(hostname)) return true;
  return Boolean(
    document.querySelector('td.cdk-column-preco input.ipt-price')
    && document.querySelector('td.cdk-column-ean')
  );
}

function getHrCotacaoCell(row, column) {
  return row.querySelector?.(`td.cdk-column-${column}`) || null;
}

function getHrCotacaoEan(row) {
  return limparEAN(getHrCotacaoCell(row, 'ean')?.textContent || '');
}

function getHrCotacaoNome(row) {
  return normalizeCellText(getHrCotacaoCell(row, 'descricao')?.textContent || '');
}

function getHrCotacaoPriceCandidates(row) {
  const inputs = Array.from(row.querySelectorAll('td.cdk-column-preco input'));
  return inputs.filter(input => !input.disabled && !input.readOnly && isVisible(input));
}

function isHrCotacaoProductRow(row) {
  if (!row.querySelector?.('td.cdk-column-preco input')) return false;
  return Boolean(getHrCotacaoEan(row) || getHrCotacaoNome(row));
}

function getHrCotacaoRows() {
  return Array.from(document.querySelectorAll('tr')).filter(isHrCotacaoProductRow);
}

function hrCotacaoRowShowsPrice(row, expectedPrice, samePriceLike) {
  const inputs = Array.from(row.querySelectorAll('td.cdk-column-preco input'));
  return inputs.some(input => samePriceLike(getControlValue(input), expectedPrice));
}

// Arius ERP / Cotação (SmartClient, ex.: *.arius-web.harpocloud.com.br):
// a UI é canvas (widgets isc.*), sem inputs no DOM. Toda a extração/preenchimento
// acontece no MAIN world via arius-main-world.js; aqui (mundo isolado) apenas
// detectamos a página e conversamos com o bridge por CustomEvent.
function isAriusCotacaoPage(hostname = window.location.hostname || '') {
  if (/(^|\.)arius-web\./i.test(hostname)) return true;
  const title = document.title || '';
  return /Arius\s*ERP/i.test(title) && /Cota[çc][ãa]o/i.test(title);
}

function ariusSendCommand(kind, payload = {}, timeoutMs = 120000) {
  return new Promise(resolve => {
    const requestId = `arius-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      document.removeEventListener('venpro:arius-command-result', onResult);
      resolve(result);
    };
    const onResult = event => {
      const detail = (event && event.detail) || {};
      if (detail.requestId !== requestId) return;
      finish(detail);
    };
    document.addEventListener('venpro:arius-command-result', onResult);
    try {
      document.dispatchEvent(new CustomEvent('venpro:arius-command', {
        detail: { requestId, kind, ...payload },
      }));
    } catch (err) {
      finish({ ok: false, reason: (err && err.message) || 'dispatch_falhou' });
    }
    setTimeout(() => finish({ ok: false, reason: 'timeout' }), timeoutMs);
  });
}

async function extractAriusItems() {
  const result = await ariusSendCommand('extract');
  return Array.isArray(result?.items) ? result.items : [];
}

async function fillAriusPrices(prices) {
  const result = await ariusSendCommand('fill', { prices: Array.isArray(prices) ? prices : [] });
  return {
    filled: Number(result?.filled) || 0,
    failed: Array.isArray(result?.failed) ? result.failed : [],
    details: Array.isArray(result?.details) ? result.details : [],
    site: 'arius-cotacao',
    rowCount: Number(result?.recordCount) || 0,
  };
}

// Bluesoft ERP - Portal do Fornecedor / Preencher Cotação (erp.bluesoft.com.br):
// AngularJS + ui-grid dentro do iframe same-origin id="corpo". A extração/gravação
// roda no MAIN world (bluesoft-main-world.js, que alcança o iframe); aqui apenas
// detectamos a página e falamos com o bridge por CustomEvent.
function isBluesoftCotacaoPage(hostname = window.location.hostname || '') {
  if (!/(^|\.)bluesoft\.com\.br$/i.test(hostname)) return false;
  const corpo = document.getElementById('corpo');
  if (!corpo) return false;
  let url = '';
  try {
    url = corpo.contentWindow?.location?.pathname || '';
  } catch {}
  if (!url) url = corpo.getAttribute('src') || corpo.src || '';
  return /cotacoes\/fornecedor/i.test(url);
}

function bluesoftSendCommand(kind, payload = {}, timeoutMs = 120000) {
  return new Promise(resolve => {
    const requestId = `bluesoft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      document.removeEventListener('venpro:bluesoft-command-result', onResult);
      resolve(result);
    };
    const onResult = event => {
      const detail = (event && event.detail) || {};
      if (detail.requestId !== requestId) return;
      finish(detail);
    };
    document.addEventListener('venpro:bluesoft-command-result', onResult);
    try {
      document.dispatchEvent(new CustomEvent('venpro:bluesoft-command', {
        detail: { requestId, kind, ...payload },
      }));
    } catch (err) {
      finish({ ok: false, reason: (err && err.message) || 'dispatch_falhou' });
    }
    setTimeout(() => finish({ ok: false, reason: 'timeout' }), timeoutMs);
  });
}

async function extractBluesoftItems() {
  const result = await bluesoftSendCommand('extract');
  return Array.isArray(result?.items) ? result.items : [];
}

async function fillBluesoftPrices(prices) {
  const result = await bluesoftSendCommand('fill', { prices: Array.isArray(prices) ? prices : [] });
  return {
    filled: Number(result?.filled) || 0,
    failed: Array.isArray(result?.failed) ? result.failed : [],
    details: Array.isArray(result?.details) ? result.details : [],
    site: 'bluesoft-cotacao',
    rowCount: Number(result?.recordCount) || 0,
  };
}

// "Cotação Web" da Guia Sistemas - Precificar do fornecedor (ex.:
// cg.jrsupermercados.com.br/Fornecedores/Precificar). Syncfusion ej2 Grid no
// contexto da página; a extração/gravação roda no MAIN world
// (guiacotacao-main-world.js). Aqui só detectamos e conversamos por CustomEvent.
function isGuiaCotacaoPage(hostname = window.location.hostname || '', path = window.location.pathname || '') {
  if (!/\/Fornecedores\/Precificar/i.test(path)) return false;
  return Boolean(document.querySelector('.e-grid') || document.getElementById('Grid'));
}

function guiaSendCommand(kind, payload = {}, timeoutMs = 120000) {
  return new Promise(resolve => {
    const requestId = `guia-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      document.removeEventListener('venpro:guia-command-result', onResult);
      resolve(result);
    };
    const onResult = event => {
      const detail = (event && event.detail) || {};
      if (detail.requestId !== requestId) return;
      finish(detail);
    };
    document.addEventListener('venpro:guia-command-result', onResult);
    try {
      document.dispatchEvent(new CustomEvent('venpro:guia-command', {
        detail: { requestId, kind, ...payload },
      }));
    } catch (err) {
      finish({ ok: false, reason: (err && err.message) || 'dispatch_falhou' });
    }
    setTimeout(() => finish({ ok: false, reason: 'timeout' }), timeoutMs);
  });
}

async function extractGuiaItems() {
  const result = await guiaSendCommand('extract');
  return Array.isArray(result?.items) ? result.items : [];
}

async function fillGuiaPrices(prices) {
  const result = await guiaSendCommand('fill', { prices: Array.isArray(prices) ? prices : [] });
  return {
    filled: Number(result?.filled) || 0,
    failed: Array.isArray(result?.failed) ? result.failed : [],
    details: Array.isArray(result?.details) ? result.details : [],
    site: 'guia-cotacao',
    rowCount: Number(result?.recordCount) || 0,
  };
}

function getEstanciaForm(root = document) {
  return root.forms?.form1
    || root.querySelector?.('form[name="form1"]')
    || root.querySelector?.('form[action*="cotacao"]')
    || root.querySelector?.('form')
    || null;
}

function getEstanciaSelect(root = document) {
  return root.querySelector?.('select[name="arquivo"], select#arquivo') || null;
}

function estanciaInput(root, name) {
  return root.querySelector?.(`[name="${CSS.escape(name)}"]`) || null;
}

function estanciaRowIndexFromHidden(hidden) {
  const match = String(hidden?.name || hidden?.id || '').match(/_(\d+)$/);
  return match ? Number(match[1]) : null;
}

function normalizeEstanciaPackageQty(value) {
  const n = Number(String(value ?? '').replace(',', '.').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0 || n > 9999) return 1;
  return Math.round(n);
}

function getEstanciaPackageQtyFromText(text) {
  const normalized = normalizeCellText(text).toUpperCase();
  const patterns = [
    /\b(?:CX|CAIXA|FD|FDO|FARDO|PCT|PACOTE|DISPLAY|DP|SC|SACO|UN|UND|UNID)\s*-?\s*(\d{1,4})\b/,
    /\bC\/\s*(\d{1,4})\b/,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const qty = normalizeEstanciaPackageQty(match[1]);
    if (qty > 0) return qty;
  }
  return 1;
}

function cleanupEstanciaProductName(value, ean = '') {
  let text = normalizeCellText(value)
    .replace(/\bObserva[çc][ãa]o:?.*$/i, '')
    .replace(/\bQtd\.?\s*(Pedida|Dispon[ií]vel|Por Embalagem)?\b.*$/i, '')
    .replace(/\bValor\s+da\s+Embalagem\b.*$/i, '')
    .trim();
  if (ean) text = text.replace(ean, '').trim();
  return text
    .replace(/\b\d{8,14}\b/g, '')
    .replace(/\b(CX|FD|FDO|FARDO|PCT|PACOTE|UN|UND|UNID|SC)\s*-?\s*\d{1,4}\b/ig, '')
    .replace(/^\d{1,10}\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseEstanciaRowMeta(row) {
  const fullText = normalizeCellText(row?.innerText || row?.textContent || '');
  const ean = extractEANFromRow(row, 'estancia-cotacao') || limparEAN(fullText) || '';
  if (!ean || !/[A-Za-zÀ-ú]{3}/.test(fullText)) return null;

  let nome = cleanupEstanciaProductName(getCellTextByHeader(row, [
    /descri[çc][ãa]o/i,
    /produto/i,
  ], [/qtd|valor|refer/i]), ean);

  if (!nome) {
    const lines = String(row.innerText || row.textContent || '')
      .split(/\n+/)
      .map(normalizeCellText)
      .filter(Boolean);
    for (const line of lines) {
      const candidate = cleanupEstanciaProductName(line, ean);
      const loose = normalizeLooseText(candidate);
      if (!candidate || !/[A-Za-zÀ-ú]{3}/.test(candidate)) continue;
      if (/^(cod barras|descricao|qtd|valor|referencia|paginas)$/i.test(loose)) continue;
      if (/^(cx|fd|fardo|pct|pacote|un)\s*-?\s*\d+$/i.test(candidate)) continue;
      nome = candidate;
      break;
    }
  }

  const hidden = row.querySelector('input[type="hidden"][name^="codigoplu_"], input[type="hidden"][id^="codigoplu_"]');
  const idx = estanciaRowIndexFromHidden(hidden);
  if (idx === null || !nome) return null;

  const quantityInput = estanciaInput(row, `vlr1_${idx}`) || estanciaInput(document, `vlr1_${idx}`);
  const referenceInput = estanciaInput(row, `vlr2_${idx}`) || estanciaInput(document, `vlr2_${idx}`);
  const priceInput = estanciaInput(row, `vlr3_${idx}`) || estanciaInput(document, `vlr3_${idx}`);
  const packageQty = getEstanciaPackageQtyFromText(fullText);

  return {
    idx,
    codigo: hidden?.value || '',
    ean,
    nome,
    packageQty,
    quantityInput,
    referenceInput,
    priceInput,
    signature: `${hidden?.value || ''}|${ean}|${normalizeRowKey(nome)}`,
  };
}

function isEstanciaProductRow(row) {
  const meta = parseEstanciaRowMeta(row);
  if (!meta || !meta.priceInput || !meta.quantityInput || !meta.referenceInput) return false;
  estanciaRowMeta.set(row, meta);
  return true;
}

function getEstanciaRows() {
  const rows = [];
  const seen = new Set();
  for (const hidden of Array.from(document.querySelectorAll('input[type="hidden"][name^="codigoplu_"], input[type="hidden"][id^="codigoplu_"]'))) {
    const row = hidden.closest('tr');
    if (!row || seen.has(row)) continue;
    if (!isEstanciaProductRow(row)) continue;
    rows.push(row);
    seen.add(row);
  }
  return rows;
}

function getEstanciaPriceCandidates(row) {
  const meta = estanciaRowMeta.get(row) || parseEstanciaRowMeta(row);
  return meta?.priceInput ? [meta.priceInput] : [];
}

function estanciaRowShowsPrice(row, expectedPrice, samePriceLike) {
  const meta = estanciaRowMeta.get(row) || parseEstanciaRowMeta(row);
  return meta?.priceInput ? samePriceLike(getControlValue(meta.priceInput), expectedPrice) : false;
}

function getEasyCotacaoEditableControls(root = document.body) {
  const unsafeTypes = /^(hidden|button|submit|reset|checkbox|radio|file|image|password)$/i;
  const self = isEditableValueControl(root)
    && !(root.tagName === 'INPUT' && unsafeTypes.test(String(root.getAttribute('type') || '').toLowerCase()))
    && !root.disabled
    && !root.readOnly
    && isVisible(root)
    ? [root]
    : [];
  const controls = Array.from(root.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"]'))
    .filter(control => !control.disabled && !control.readOnly && isVisible(control))
    .filter(control => !(control.tagName === 'INPUT' && unsafeTypes.test(String(control.getAttribute('type') || '').toLowerCase())));
  return [...self, ...controls].filter((el, index, all) => all.indexOf(el) === index);
}

function getEasyCotacaoCellByHeader(row, includePatterns, excludePatterns = []) {
  const visualIndex = findVisualColumnIndexByHeader(row, includePatterns, excludePatterns);
  if (visualIndex >= 0) return getCellAtVisualColumn(row, visualIndex);

  const index = findColumnIndexByHeader(row, includePatterns, excludePatterns);
  if (index >= 0) return getDirectCells(row)[index] || null;

  return null;
}

function easyCotacaoControlsByPosition(root) {
  return getEasyCotacaoEditableControls(root)
    .map(el => ({ el, rect: el.getBoundingClientRect() }))
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)
    .map(item => item.el);
}

function isEasyCotacaoIgnoredText(text) {
  const loose = normalizeLooseText(text);
  return !loose
    || loose === 'todos'
    || loose === 'cotados'
    || loose === 'nao cotados'
    || loose === 'produto'
    || loose === 'qtd'
    || loose === 'qtd.'
    || loose === 'qtd. emb.'
    || loose === 'qtd emb'
    || loose === 'preco'
    || loose === 'similar'
    || loose === 'observacao'
    || loose === 'salvar cotacao'
    || loose === 'sair'
    || /^qtd:?\s*[\d,.]+$/i.test(text)
    || /^0[,.]0{1,2}$/.test(text)
    || /^r\$\s*0(?:[,.]0{1,2})?$/i.test(text);
}

function cleanupEasyCotacaoProductName(value, ean = '') {
  let text = normalizeCellText(value)
    .replace(/\bObserva[çc][ãa]o:?.*$/i, '')
    .replace(/\bQtd\.?\s*:?.*$/i, '')
    .replace(/\bPre[çc]o\b.*$/i, '')
    .replace(/\bSimilar\b.*$/i, '')
    .replace(/r\$\s*\d+(?:[,.]\d+)?/ig, '')
    .trim();
  if (ean) text = text.replace(ean, '').trim();
  text = text
    .replace(/\b\d{8,14}\b/g, '')
    .replace(/^\d{1,10}\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function getEasyCotacaoQuantityTarget(row) {
  const meta = easyCotacaoRowMeta.get(row);
  if (meta?.quantityInput && isVisible(meta.quantityInput) && isEditableValueControl(meta.quantityInput)) {
    return meta.quantityInput;
  }

  const quantityCell = getEasyCotacaoCellByHeader(row, [
    /qtd\.?\s*emb\.?/i,
    /quantidade\s*emb/i,
    /\bemb\.?\b/i,
  ], [/pre[çc]o|produto|similar|total/i]);
  const quantityControl = quantityCell ? easyCotacaoControlsByPosition(quantityCell)[0] : null;
  if (quantityControl) {
    if (meta) meta.quantityInput = quantityControl;
    return quantityControl;
  }

  const priceCell = getEasyCotacaoCellByHeader(row, [/^\s*pre[çc]o\s*$/i, /\bpre[çc]o\b/i], [/produto|similar|qtd|emb|total/i]);
  const priceControls = new Set(priceCell ? easyCotacaoControlsByPosition(priceCell) : []);
  const controls = easyCotacaoControlsByPosition(row).filter(control => !priceControls.has(control));
  if (controls.length >= 1) {
    const first = controls[0];
    const context = normalizeLooseText(`${first.name || ''} ${first.id || ''} ${first.className || ''} ${first.placeholder || ''} ${first.closest?.('td, th')?.textContent || ''}`);
    if (controls.length >= 2 || context.includes('qtd') || context.includes('emb')) {
      if (meta) meta.quantityInput = first;
      return first;
    }
  }

  return null;
}

function getEasyCotacaoPriceTarget(row) {
  const meta = easyCotacaoRowMeta.get(row);
  if (meta?.priceInput && isVisible(meta.priceInput) && isEditableValueControl(meta.priceInput)) {
    return meta.priceInput;
  }

  const priceCell = getEasyCotacaoCellByHeader(row, [
    /^\s*pre[çc]o\s*$/i,
    /\bpre[çc]o\b/i,
    /\bvalor\b/i,
  ], [/produto|similar|qtd|emb|total/i]);
  const priceControl = priceCell ? easyCotacaoControlsByPosition(priceCell)[0] : null;
  if (priceControl) {
    if (meta) meta.priceInput = priceControl;
    return priceControl;
  }

  const quantityTarget = getEasyCotacaoQuantityTarget(row);
  const controls = easyCotacaoControlsByPosition(row).filter(control => control !== quantityTarget);
  const priceLike = controls.filter(control => {
    const context = normalizeLooseText(`${control.name || ''} ${control.id || ''} ${control.className || ''} ${control.placeholder || ''} ${control.getAttribute('aria-label') || ''} ${control.closest?.('td, th')?.textContent || ''}`);
    return (context.includes('preco') || context.includes('valor'))
      && !context.includes('qtd')
      && !context.includes('emb');
  });

  const target = priceLike[0] || controls[controls.length - 1] || null;
  if (target && meta) meta.priceInput = target;
  return target;
}

function getEasyCotacaoPriceCandidates(row) {
  const target = getEasyCotacaoPriceTarget(row);
  return target ? [target] : [];
}

function parseEasyCotacaoRowMeta(row) {
  const fullText = normalizeCellText(row?.innerText || row?.textContent || '');
  const ean = extractEANFromRow(row, 'easy-cotacao-web') || limparEAN(fullText) || '';
  if (!ean || !/[A-Za-zÀ-ú]{3}/.test(fullText)) return null;

  const eanIndex = fullText.indexOf(ean);
  const beforeEan = eanIndex >= 0 ? fullText.slice(0, eanIndex) : '';
  const codeMatch = beforeEan.match(/(\d{2,10})\s*$/);
  const codigo = codeMatch ? codeMatch[1] : '';

  let nome = '';
  const productCell = getEasyCotacaoCellByHeader(row, [
    /produto/i,
    /descri[çc][ãa]o/i,
    /mercadoria/i,
  ], [/pre[çc]o|qtd|emb|similar/i]);
  if (productCell) nome = cleanupEasyCotacaoProductName(productCell.textContent || '', ean);

  if (!nome) {
    const lines = String(row.innerText || row.textContent || '')
      .split(/\n+/)
      .map(normalizeCellText)
      .filter(Boolean);
    for (const line of lines) {
      const candidate = cleanupEasyCotacaoProductName(line, ean);
      if (candidate && /[A-Za-zÀ-ú]{3}/.test(candidate) && !isEasyCotacaoIgnoredText(candidate)) {
        nome = candidate;
        break;
      }
    }
  }

  if (!nome) nome = cleanupEasyCotacaoProductName(extractProductNameFromRow(row), ean);
  if (!nome) return null;

  return {
    codigo,
    ean,
    nome,
    quantityInput: null,
    priceInput: null,
    signature: `${codigo}|${ean}|${normalizeRowKey(nome)}`,
  };
}

function isEasyCotacaoProductRow(row) {
  const text = normalizeCellText(row?.innerText || row?.textContent || '');
  if (!/\d{8,14}/.test(text) || !/[A-Za-zÀ-ú]{3}/.test(text)) return false;
  const meta = parseEasyCotacaoRowMeta(row);
  if (!meta) return false;
  easyCotacaoRowMeta.set(row, meta);
  return easyCotacaoControlsByPosition(row).length > 0;
}

function getEasyCotacaoRows() {
  const rows = [];
  const seen = new Set();
  for (const row of Array.from(document.querySelectorAll('tr')).filter(isVisible)) {
    if (!isEasyCotacaoProductRow(row)) continue;
    const meta = easyCotacaoRowMeta.get(row) || parseEasyCotacaoRowMeta(row);
    const key = `${meta?.signature || ''}|${rows.length}`;
    if (!meta || seen.has(key)) continue;
    meta.quantityInput = getEasyCotacaoQuantityTarget(row);
    meta.priceInput = getEasyCotacaoPriceTarget(row);
    easyCotacaoRowMeta.set(row, meta);
    rows.push(row);
    seen.add(key);
  }
  return rows;
}

function easyCotacaoRowShowsPrice(row, expectedPrice, samePriceLike, empresaColuna = 0) {
  const target = getSelectedPriceInput(row, empresaColuna, 'easy-cotacao-web');
  return target ? samePriceLike(getControlValue(target), expectedPrice) : false;
}

function parsePositivePriceNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  let normalized = raw.replace(/[^\d,.-]/g, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeHipcomerpApiLimit(value) {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 && n <= 500 ? n : 20;
}

function updateHipcomerpApiState(state = {}) {
  if (state.baseCaptured != null) hipcomerpApiState.baseCaptured = Boolean(state.baseCaptured);
  if (state.bridgeVersion != null) hipcomerpApiState.bridgeVersion = String(state.bridgeVersion || '');
  if (state.fornecedor != null) hipcomerpApiState.fornecedor = String(state.fornecedor || '');
  if (state.loja != null) hipcomerpApiState.loja = String(state.loja || '');
  if (state.numeroCotacao != null) hipcomerpApiState.numeroCotacao = String(state.numeroCotacao || '');
  if (state.limit != null) hipcomerpApiState.limit = normalizeHipcomerpApiLimit(state.limit);
  if (state.hasAuth != null) hipcomerpApiState.hasAuth = Boolean(state.hasAuth);
  hipcomerpApiState.ready = Boolean(
    state.ready
    || (hipcomerpApiState.baseCaptured
      && hipcomerpApiState.fornecedor
      && hipcomerpApiState.loja
      && hipcomerpApiState.numeroCotacao
      && hipcomerpApiState.hasAuth)
  );
  hipcomerpApiState.lastSeenAt = Date.now();
}

function hipcomerpApiPageFromRequest(request = {}) {
  const page = Number.parseInt(request.page || '0', 10);
  return Number.isInteger(page) && page >= 0 ? page : 0;
}

function rememberHipcomerpApiPage(page, response) {
  if (!Number.isInteger(page) || page < 0 || !response || typeof response !== 'object') return;
  const itens = Array.isArray(response.itens) ? response.itens : [];
  if (!itens.length && response.quantidadeTotal == null) return;
  hipcomerpApiState.pages.set(page, {
    quantidadeTotal: Number.parseInt(response.quantidadeTotal || itens.length || '0', 10) || itens.length,
    itens,
  });
  if (response.quantidadeTotal != null) {
    hipcomerpApiState.total = Number.parseInt(response.quantidadeTotal || '0', 10) || hipcomerpApiState.total;
  }
}

function isCurrentHipcomerpBridgeState(state = {}) {
  return state?.bridgeVersion === HIPCOMERP_BRIDGE_VERSION;
}

function rememberHipcomerpApiCapture(detail = {}) {
  if (!isCurrentHipcomerpBridgeState(detail.state || {})) return;
  updateHipcomerpApiState(detail.state || {});
  const request = detail.request || {};
  const response = detail.response;
  const path = String(request.path || '');
  const cotacaoMatch = path.match(/\/cotacao\/(\d+)\/itens/i);
  if (cotacaoMatch && !hipcomerpApiState.numeroCotacao) {
    hipcomerpApiState.numeroCotacao = cotacaoMatch[1];
  }
  if (/\/cotacao\/\d+\/itens/i.test(path)) {
    rememberHipcomerpApiPage(hipcomerpApiPageFromRequest(request), response);
  }
}

function resolveHipcomerpApiCommand(detail = {}) {
  const requestId = String(detail.requestId || '');
  const pending = hipcomerpApiState.pending.get(requestId);
  if (!pending) return;
  if (pending.bridgeVersion && !isCurrentHipcomerpBridgeState(detail.state || {})) return;
  updateHipcomerpApiState(detail.state || {});
  hipcomerpApiState.pending.delete(requestId);
  if (pending.timer) clearTimeout(pending.timer);
  pending.resolve(detail);
}

function hipcomerpUsesCanvasKit() {
  return Boolean(
    document.body?.getAttribute?.('flt-renderer')?.includes('canvaskit')
    || document.querySelector('flutter-view flt-glass-pane')
    || document.querySelector('flt-canvas-container')
  );
}

function getHipcomerpApiState() {
  return {
    ok: true,
    site: 'hipcomerp-cotacao',
    ready: hipcomerpApiState.ready,
    baseCaptured: hipcomerpApiState.baseCaptured,
    bridgeVersion: hipcomerpApiState.bridgeVersion,
    fornecedor: hipcomerpApiState.fornecedor,
    loja: hipcomerpApiState.loja,
    numeroCotacao: hipcomerpApiState.numeroCotacao,
    limit: normalizeHipcomerpApiLimit(hipcomerpApiState.limit),
    hasAuth: hipcomerpApiState.hasAuth,
    cachedPages: hipcomerpApiState.pages.size,
    total: hipcomerpApiState.total,
    usesCanvasKit: hipcomerpUsesCanvasKit(),
    lastSeenAt: hipcomerpApiState.lastSeenAt,
  };
}

async function waitForHipcomerpApiState(timeoutMs = 3500) {
  if (hipcomerpApiState.ready) return getHipcomerpApiState();
  await refreshHipcomerpApiState(700);
  if (hipcomerpApiState.ready) return getHipcomerpApiState();
  return new Promise(resolve => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (hipcomerpApiState.ready || Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        resolve(getHipcomerpApiState());
      }
    }, 100);
  });
}

function hipcomerpApiCommand(command, timeoutMs = 15000) {
  return new Promise(resolve => {
    const requestId = `hipcom-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const bridgeVersion = command.bridgeVersion || HIPCOMERP_BRIDGE_VERSION;
    const timer = setTimeout(() => {
      hipcomerpApiState.pending.delete(requestId);
      resolve({ ok: false, reason: 'api_command_timeout', state: getHipcomerpApiState() });
    }, timeoutMs);
    hipcomerpApiState.pending.set(requestId, { resolve, timer, bridgeVersion });
    document.dispatchEvent(new CustomEvent('venpro:hipcom-api-command', {
      detail: { requestId, ...command, minBridgeVersion: bridgeVersion },
    }));
  });
}

async function refreshHipcomerpApiState(timeoutMs = 900) {
  const response = await hipcomerpApiCommand({ kind: 'state' }, timeoutMs);
  if (response?.state) updateHipcomerpApiState(response.state);
  return getHipcomerpApiState();
}

async function getHipcomerpApiStateLive() {
  if (/(^|\.)cotacao\.hipcomerp\.com\.br$/i.test(window.location.hostname || '')) {
    await refreshHipcomerpApiState(700);
  }
  return getHipcomerpApiState();
}

function normalizeHipcomerpApiItem(raw = {}, idx = 0, page = 1) {
  const plu = String(raw.plu ?? raw.codigo ?? '').trim();
  const ean = limparEAN(raw.codigoBarras ?? raw.codigoBarra ?? raw.ean ?? '') || '';
  const nome = normalizeCellText(raw.descricao ?? raw.nome ?? '');
  const price = parsePositivePriceNumber(raw.precoPreenchido ?? raw.preco ?? raw.valorUnitario ?? '');
  const quantidadePorCaixa = Number.parseInt(raw.quantidadePorCaixaPreenchida ?? raw.quantidadePorCaixa ?? '1', 10);
  return {
    idx,
    page,
    id: raw.id ?? '',
    numeroCotacao: hipcomerpApiState.numeroCotacao || '',
    plu,
    codigo: plu,
    ean,
    nome,
    filled: price !== null,
    current_price: price,
    quantidade: raw.quantidade ?? '',
    quantidadePorCaixa: Number.isInteger(quantidadePorCaixa) && quantidadePorCaixa > 0 ? quantidadePorCaixa : 1,
    signature: `${plu}|${ean}|${normalizeRowKey(nome)}`,
  };
}

async function fetchHipcomerpApiPage(page, limit) {
  const state = await waitForHipcomerpApiState();
  if (!state.ready) return { ok: false, reason: 'api_context_not_ready', state };
  const numeroCotacao = state.numeroCotacao;
  const response = await hipcomerpApiCommand({
    method: 'POST',
    path: `/cotacao/${numeroCotacao}/itens`,
    body: {
      numeroPagina: page,
      pesquisa: '',
      limite: limit,
    },
  });
  if (!response.ok) return response;
  rememberHipcomerpApiPage(page, response.data);
  return response;
}

async function loadHipcomerpApiItems(options = {}) {
  const state = await waitForHipcomerpApiState(options.waitMs || 3500);
  if (!state.ready) {
    return {
      ok: false,
      site: 'hipcomerp-cotacao',
      reason: state.usesCanvasKit ? 'api_context_not_ready_canvas' : 'api_context_not_ready',
      state,
      items: [],
    };
  }

  const limit = normalizeHipcomerpApiLimit(options.limit || state.limit || 20);
  const firstPage = hipcomerpApiState.pages.get(0)?.itens?.length
    ? { ok: true, data: hipcomerpApiState.pages.get(0) }
    : await fetchHipcomerpApiPage(0, limit);
  if (!firstPage.ok) return { ...firstPage, site: 'hipcomerp-cotacao', items: [] };

  const total = Number.parseInt(
    firstPage.data?.quantidadeTotal
    || hipcomerpApiState.total
    || firstPage.data?.itens?.length
    || '0',
    10
  ) || 0;
  const pages = Math.max(1, Math.ceil(total / limit));

  for (let page = 1; page < pages; page++) {
    if (hipcomerpApiState.pages.get(page)?.itens?.length) continue;
    const pageResult = await fetchHipcomerpApiPage(page, limit);
    if (!pageResult.ok) return { ...pageResult, site: 'hipcomerp-cotacao', items: [] };
  }

  const items = [];
  for (let page = 0; page < pages; page++) {
    const pageData = hipcomerpApiState.pages.get(page);
    for (const raw of pageData?.itens || []) {
      items.push(normalizeHipcomerpApiItem(raw, items.length, page));
    }
  }

  return {
    ok: true,
    site: 'hipcomerp-cotacao',
    mode: 'api',
    items,
    total: total || items.length,
    pages,
    limit,
    state: getHipcomerpApiState(),
  };
}

function hipcomerpApiSavePayloadItem(item = {}) {
  const price = parsePositivePriceNumber(item.price ?? item.preco ?? item.valorUnitario);
  const plu = String(item.plu || item.codigo || '').trim();
  if (!price || !plu) return null;
  const numeroCotacao = String(item.numeroCotacao || hipcomerpApiState.numeroCotacao || '').trim();
  if (!numeroCotacao) return null;
  const quantidadePorCaixa = Number.parseInt(item.quantidadePorCaixa ?? item.qtdCaixa ?? '1', 10);
  return {
    numeroCotacao,
    plu,
    preco: price,
    valorICMS: 0,
    quantidadePorCaixa: Number.isInteger(quantidadePorCaixa) && quantidadePorCaixa > 0 ? quantidadePorCaixa : 1,
  };
}

async function saveHipcomerpApiPrices(prices = []) {
  const state = await waitForHipcomerpApiState(1000);
  if (!state.ready) return { ok: false, site: 'hipcomerp-cotacao', reason: 'api_context_not_ready', saved: 0 };

  const payload = [];
  const seen = new Set();
  for (const item of prices || []) {
    const payloadItem = hipcomerpApiSavePayloadItem(item);
    if (!payloadItem) continue;
    const key = `${payloadItem.numeroCotacao}|${payloadItem.plu}`;
    if (seen.has(key)) continue;
    seen.add(key);
    payload.push(payloadItem);
  }

  if (!payload.length) {
    return { ok: true, site: 'hipcomerp-cotacao', saved: 0, skipped: prices.length, reason: 'no_prices_to_save' };
  }

  let saved = 0;
  const failed = [];
  for (let start = 0; start < payload.length; start += 100) {
    const chunk = payload.slice(start, start + 100);
    const result = await hipcomerpApiCommand({
      method: 'POST',
      path: '/oferta/itens',
      body: chunk,
    }, 20000);
    if (!result.ok) {
      failed.push({
        start,
        count: chunk.length,
        status: result.status || 0,
        reason: result.reason || `http_${result.status || 'unknown'}`,
      });
      continue;
    }
    saved += chunk.length;
  }

  return {
    ok: failed.length === 0,
    site: 'hipcomerp-cotacao',
    saved,
    failed,
    requested: prices.length,
    payloadCount: payload.length,
  };
}

function getHipcomerpEditableControls(root = document.body) {
  const unsafeTypes = /^(hidden|button|submit|reset|checkbox|radio|file|image|password)$/i;
  const self = isEditableValueControl(root)
    && !(root.tagName === 'INPUT' && unsafeTypes.test(String(root.getAttribute('type') || '').toLowerCase()))
    && !root.disabled
    && !root.readOnly
    && isVisible(root)
    ? [root]
    : [];
  const controls = Array.from(root.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"]'))
    .filter(control => !control.disabled && !control.readOnly && isVisible(control))
    .filter(control => !(control.tagName === 'INPUT' && unsafeTypes.test(String(control.getAttribute('type') || '').toLowerCase())));
  return [...self, ...controls].filter((el, index, all) => all.indexOf(el) === index);
}

function hipcomerpLines(root) {
  return String(root?.innerText || root?.textContent || '')
    .split(/\n+/)
    .map(normalizeCellText)
    .filter(Boolean);
}

function isHipcomerpIgnoredText(text) {
  const loose = normalizeLooseText(text);
  return !loose
    || loose === 'fornecedor'
    || loose === 'digitados'
    || loose === 'cotacao'
    || loose === 'exportar'
    || loose === 'importar'
    || loose === 'preco p/ unidade'
    || loose === 'preco p unidade'
    || loose === 'salvar e carregar mais'
    || /^r\$\s*0(?:[,.]0{1,2})?$/i.test(text)
    || /^r\$$/i.test(text);
}

function cleanupHipcomerpProductName(value, ean = '') {
  let text = normalizeCellText(value)
    .replace(/pre[çc]o\s*p\/?\s*unidade.*$/i, '')
    .replace(/r\$\s*\d+(?:[,.]\d+)?/ig, '')
    .trim();
  if (ean) text = text.replace(ean, '').trim();
  text = text.replace(/^\d{1,10}\s+/, '').trim();
  return text;
}

function parseHipcomerpCardMeta(card) {
  const lines = hipcomerpLines(card);
  const fullText = normalizeCellText(lines.join(' '));
  const ean = limparEAN(fullText);
  if (!ean || !/[A-Za-zÀ-ú]{3}/.test(fullText)) return null;

  const eanIndex = fullText.indexOf(ean);
  const beforeEan = eanIndex >= 0 ? fullText.slice(0, eanIndex) : '';
  const codeMatch = beforeEan.match(/(\d{2,10})\s*$/);
  const codigo = codeMatch ? codeMatch[1] : '';
  let nome = '';

  const lineIndex = lines.findIndex(line => line.includes(ean));
  if (lineIndex >= 0) {
    const eanLine = lines[lineIndex];
    const lineAfterEan = cleanupHipcomerpProductName(
      eanLine.slice(eanLine.indexOf(ean) + ean.length),
      ean
    );
    if (/[A-Za-zÀ-ú]{3}/.test(lineAfterEan) && !isHipcomerpIgnoredText(lineAfterEan)) {
      nome = lineAfterEan;
    }

    if (!nome) {
      for (const line of lines.slice(lineIndex + 1)) {
        const candidate = cleanupHipcomerpProductName(line, ean);
        if (candidate && /[A-Za-zÀ-ú]{3}/.test(candidate) && !isHipcomerpIgnoredText(candidate)) {
          nome = candidate;
          break;
        }
      }
    }
  }

  if (!nome) {
    const escapedEan = ean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = fullText.match(new RegExp(`${escapedEan}\\s+(.+?)(?:\\s+Pre[çc]o\\s*p\\/?\\s*unidade|\\s+R\\$|$)`, 'i'));
    if (match) nome = cleanupHipcomerpProductName(match[1], ean);
  }

  if (!nome) return null;

  return {
    codigo,
    ean,
    nome,
    priceInput: null,
    signature: `${codigo}|${ean}|${normalizeRowKey(nome)}`,
  };
}

function isHipcomerpProductCardText(root) {
  const text = normalizeCellText(root?.innerText || root?.textContent || '');
  return /\d{8,14}/.test(text)
    && /[A-Za-zÀ-ú]{3}/.test(text)
    && /pre[çc]o\s*p\/?\s*unidade/i.test(text);
}

function findHipcomerpCardRoot(from) {
  let current = from;
  while (current && current !== document.body && current !== document.documentElement) {
    if (isHipcomerpProductCardText(current)) return current;
    current = current.parentElement;
  }
  return null;
}

function isHipcomerpPriceControl(control) {
  const meta = `${control.name || ''} ${control.id || ''} ${control.className || ''} ${control.placeholder || ''} ${control.getAttribute('aria-label') || ''}`.toLowerCase();
  if (/(preco|preço|valor|unit)/.test(meta)) return true;
  const card = findHipcomerpCardRoot(control);
  return Boolean(card && isHipcomerpProductCardText(card));
}

function getHipcomerpPriceCandidates(row) {
  const meta = hipcomerpRowMeta.get(row);
  if (meta?.priceInput && isVisible(meta.priceInput) && isEditableValueControl(meta.priceInput)) {
    return [meta.priceInput];
  }

  const controls = getHipcomerpEditableControls(row).filter(isHipcomerpPriceControl);
  if (controls.length) {
    if (meta) meta.priceInput = controls[0];
    return [controls[0]];
  }

  const fallbackControls = getHipcomerpEditableControls(row);
  if (fallbackControls.length) {
    if (meta) meta.priceInput = fallbackControls[0];
    return [fallbackControls[0]];
  }

  return [];
}

function getHipcomerpRows() {
  const rows = [];
  const seen = new Set();

  for (const control of getHipcomerpEditableControls(document.body).filter(isHipcomerpPriceControl)) {
    const card = findHipcomerpCardRoot(control);
    if (!card || seen.has(card)) continue;
    const meta = parseHipcomerpCardMeta(card);
    if (!meta) continue;
    meta.priceInput = control;
    hipcomerpRowMeta.set(card, meta);
    rows.push(card);
    seen.add(card);
  }

  if (rows.length) return rows;

  const candidates = Array.from(document.querySelectorAll('div, li, section, article'))
    .filter(isVisible)
    .filter(isHipcomerpProductCardText)
    .map(el => ({ el, area: Math.max(1, el.getBoundingClientRect().width * el.getBoundingClientRect().height) }))
    .sort((a, b) => a.area - b.area);

  for (const { el } of candidates) {
    if (rows.some(row => el.contains(row) || row.contains(el))) continue;
    const meta = parseHipcomerpCardMeta(el);
    if (!meta) continue;
    hipcomerpRowMeta.set(el, meta);
    rows.push(el);
  }

  return rows;
}

function getHipcomerpRowSignature(row) {
  const meta = hipcomerpRowMeta.get(row) || parseHipcomerpCardMeta(row);
  return meta?.signature || '';
}

function hipcomerpPageSignature() {
  return getHipcomerpRows()
    .map(getHipcomerpRowSignature)
    .filter(Boolean)
    .join('||');
}

function hipcomerpRowShowsPrice(row, expectedPrice, samePriceLike, empresaColuna = 0) {
  return getSelectedPriceInput(row, empresaColuna, 'hipcomerp-cotacao')
    ? samePriceLike(getControlValue(getSelectedPriceInput(row, empresaColuna, 'hipcomerp-cotacao')), expectedPrice)
    : false;
}

function getHipcomerpClickable(el) {
  return el.closest?.('button, [role="button"], a, [onclick]') || el;
}

function isDisabledAction(el) {
  const target = getHipcomerpClickable(el);
  return Boolean(target.disabled)
    || target.getAttribute?.('aria-disabled') === 'true'
    || /\b(disabled|desabilitado)\b/i.test(`${target.className || ''}`);
}

function findHipcomerpSaveAction() {
  const candidates = Array.from(document.querySelectorAll('button, [role="button"], a, div, span'))
    .filter(isVisible)
    .map(el => ({
      el,
      target: getHipcomerpClickable(el),
      text: normalizeCellText(el.innerText || el.textContent || ''),
    }))
    .filter(item => item.text && item.text.length <= 80)
    .filter(item => !isDisabledAction(item.el))
    .map(item => {
      const tag = String(item.target?.tagName || '').toLowerCase();
      const rank = tag === 'button' ? 4
        : item.target?.getAttribute?.('role') === 'button' ? 3
        : tag === 'a' ? 2
        : item.target?.hasAttribute?.('onclick') ? 1
        : 0;
      return { ...item, rank };
    })
    .sort((a, b) => b.rank - a.rank);

  const next = candidates.find(item => /salvar\s+e\s+carregar\s+mais/i.test(item.text));
  if (next) return { el: next.target, kind: 'next', text: next.text };

  const final = candidates.find(item => /^(salvar|salvar\s+e\s+finalizar|finalizar)$/i.test(item.text));
  if (final) return { el: final.target, kind: 'final', text: final.text };

  return null;
}

async function advanceHipcomerpPage() {
  const beforeSignature = hipcomerpPageSignature();
  const beforeCount = getHipcomerpRows().length;
  const action = findHipcomerpSaveAction();
  if (!action) {
    return { ok: true, advanced: false, done: true, reason: 'save_button_not_found', rowCount: beforeCount };
  }

  try {
    action.el.scrollIntoView({ block: 'center', inline: 'nearest' });
  } catch {}
  await waitForGridRender(80);

  try {
    action.el.click?.();
    action.el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  } catch {
    return { ok: false, advanced: false, done: false, reason: 'click_failed', rowCount: beforeCount };
  }

  if (action.kind === 'final') {
    await waitForGridRender(700);
    return { ok: true, advanced: false, done: true, saved: true, reason: 'final_saved', rowCount: beforeCount };
  }

  for (let i = 0; i < 48; i++) {
    await waitForGridRender(250);
    const afterSignature = hipcomerpPageSignature();
    const afterCount = getHipcomerpRows().length;
    if (afterSignature && afterSignature !== beforeSignature) {
      return {
        ok: true,
        advanced: true,
        done: false,
        reason: 'next_loaded',
        rowCount: afterCount,
        beforeSignature,
        afterSignature,
      };
    }
    if (!afterCount) {
      return { ok: true, advanced: false, done: true, reason: 'no_visible_items_after_save', rowCount: 0 };
    }
  }

  return {
    ok: false,
    advanced: false,
    done: false,
    reason: 'items_not_changed_after_save',
    rowCount: beforeCount,
    beforeSignature,
  };
}

function getEstanciaCurrentPage(root = document) {
  const page = Number.parseInt(estanciaInput(root, 'pagina')?.value || '1', 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function getEstanciaPages(root = document) {
  const text = root.body?.innerText || root.body?.textContent || '';
  const markerIndex = text.search(/P[áa]ginas:/i);
  const tail = markerIndex >= 0 ? text.slice(markerIndex, markerIndex + 700) : '';
  const pageNumbers = Array.from(tail.matchAll(/\b\d{1,3}\b/g))
    .map(match => Number(match[0]))
    .filter(value => Number.isInteger(value) && value > 0 && value <= 999);
  const currentPage = getEstanciaCurrentPage(root);
  return Math.max(1, currentPage, ...pageNumbers);
}

function getEstanciaState(root = document) {
  const select = getEstanciaSelect(root);
  const rows = root === document ? getEstanciaRows() : Array.from(root.querySelectorAll('input[type="hidden"][name^="codigoplu_"], input[type="hidden"][id^="codigoplu_"]'));
  return {
    ok: Boolean(getEstanciaForm(root)),
    site: 'estancia-cotacao',
    quoteIndex: select ? select.selectedIndex : -1,
    quoteCount: select ? select.options.length : 0,
    quoteValue: select ? select.value : '',
    quoteText: select ? (select.options[select.selectedIndex]?.textContent || '').trim() : '',
    page: getEstanciaCurrentPage(root),
    pages: getEstanciaPages(root),
    rowCount: rows.length,
    hasSelect: Boolean(select),
  };
}

function estanciaFormParams(root = document, overrides = {}, submitName = '') {
  const form = getEstanciaForm(root);
  if (!form) throw new Error('Formulário do Estância não encontrado.');

  const params = new URLSearchParams();
  for (const el of Array.from(form.elements || [])) {
    if (!el.name || el.disabled) continue;
    const tag = String(el.tagName || '').toLowerCase();
    const type = String(el.type || '').toLowerCase();
    if (type === 'submit' || type === 'button' || type === 'image' || type === 'reset' || tag === 'button') continue;
    if ((type === 'checkbox' || type === 'radio') && !el.checked) continue;
    params.append(el.name, el.value == null ? '' : String(el.value));
  }

  for (const [key, value] of Object.entries(overrides)) {
    params.set(key, value == null ? '' : String(value));
  }
  if (submitName) params.set(submitName, 'Grava Alterações');
  return params;
}

function applyEstanciaHtml(html, responseUrl = '') {
  const parsed = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const bodyText = parsed.body?.innerText || '';
  if (/Internal\s+server\s+error/i.test(bodyText)) {
    return { ok: false, reason: 'server_500', state: getEstanciaState() };
  }
  if (/n[aã]o\s+tem\s+mais\s+cota[çc][aã]o|nenhuma\s+cota[çc][aã]o/i.test(bodyText)) {
    return { ok: false, reason: 'quotation_unavailable', state: getEstanciaState(parsed) };
  }
  if (!getEstanciaForm(parsed)) {
    return { ok: false, reason: 'form_not_found', state: getEstanciaState(parsed) };
  }

  document.body.innerHTML = parsed.body.innerHTML;
  document.title = parsed.title || document.title;
  if (responseUrl) {
    try {
      const nextUrl = new URL(responseUrl, location.href);
      if (nextUrl.origin === location.origin) history.replaceState(null, '', nextUrl.href);
    } catch {}
  }
  return { ok: true, state: getEstanciaState() };
}

async function postEstanciaForm(params, action = '') {
  const form = getEstanciaForm();
  const url = new URL(action || form?.getAttribute('action') || 'cotacao.asp', location.href).href;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: params.toString(),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const text = await response.text();
  if (!response.ok) return { ok: false, reason: `http_${response.status}`, state: getEstanciaState() };
  return applyEstanciaHtml(text, response.url);
}

async function openEstanciaCotacaoPage() {
  if (!isEstanciaCotacaoPage(window.location.hostname, window.location.pathname, document.body?.innerText || '')) {
    return { ok: false, reason: 'not_estancia' };
  }
  if (/\/cotacao\.asp$/i.test(window.location.pathname) && getEstanciaSelect()) {
    return { ok: true, state: getEstanciaState() };
  }
  const response = await fetch(new URL('cotacao.asp', location.href).href, {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const text = await response.text();
  if (!response.ok) return { ok: false, reason: `http_${response.status}` };
  const result = applyEstanciaHtml(text, response.url);
  if (result.ok) {
    try { history.replaceState(null, '', new URL('cotacao.asp', location.href).href); } catch {}
  }
  return result;
}

async function saveEstanciaPage() {
  if (detectQuotationSite() !== 'estancia-cotacao') return { ok: false, reason: 'not_estancia' };
  const page = getEstanciaCurrentPage();
  const params = estanciaFormParams(document, {
    pagina: String(page),
    paginaAnt: String(page),
    buscar: 'False',
    gravar: 'true',
  }, 'grava');
  return postEstanciaForm(params);
}

async function loadEstanciaPage(page) {
  if (detectQuotationSite() !== 'estancia-cotacao') return { ok: false, reason: 'not_estancia' };
  const desiredPage = Number.parseInt(page, 10);
  if (!Number.isInteger(desiredPage) || desiredPage < 1) return { ok: false, reason: 'invalid_page' };
  const currentPage = getEstanciaCurrentPage();
  const params = estanciaFormParams(document, {
    pagina: String(desiredPage),
    paginaAnt: String(currentPage),
    buscar: 'False',
    gravar: 'false',
  });
  return postEstanciaForm(params);
}

async function loadEstanciaQuote(quoteIndex) {
  if (detectQuotationSite() !== 'estancia-cotacao') return { ok: false, reason: 'not_estancia' };
  const select = getEstanciaSelect();
  const index = Number.parseInt(quoteIndex, 10);
  if (!select || !Number.isInteger(index) || index < 0 || index >= select.options.length) {
    return { ok: false, reason: 'invalid_quote' };
  }
  const option = select.options[index];
  const params = estanciaFormParams(document, {
    arquivo: option.value,
    pagina: '1',
    paginaAnt: '',
    buscar: 'false',
    gravar: 'false',
  });
  return postEstanciaForm(params);
}

function bubbleCatalogTextItems() {
  return Array.from(document.querySelectorAll('div,span,p,label,td,th'))
    .filter(isVisible)
    .map(el => {
      const text = elementLeafText(el);
      const rect = el.getBoundingClientRect();
      return { el, text, loose: normalizeLooseText(text), rect };
    })
    .filter(item => item.text && item.text.length <= 180 && item.rect.width > 0 && item.rect.height > 0);
}

function findBubbleCatalogHeader(items, labels) {
  const wanted = labels.map(normalizeLooseText);
  return items
    .filter(item => wanted.includes(item.loose))
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)[0] || null;
}

function getBubbleCatalogHeaders() {
  const items = bubbleCatalogTextItems();
  return {
    cod: findBubbleCatalogHeader(items, ['Cod', 'Codigo', 'Código']),
    produto: findBubbleCatalogHeader(items, ['Produto']),
    fracionamento: findBubbleCatalogHeader(items, ['Fracionamento']),
    valor: findBubbleCatalogHeader(items, ['Valor']),
    items,
  };
}

function isBubbleIgnoredRowText(text) {
  const loose = normalizeLooseText(text);
  return !loose
    || loose === 'r$'
    || loose === 'cod'
    || loose === 'codigo'
    || loose === 'produto'
    || loose === 'fracionamento'
    || loose === 'valor'
    || loose === 'a vista'
    || loose.includes('observacoes do cliente')
    || loose.includes('observacoes cliente')
    || loose.includes('itens para cotacao');
}

function isBubbleSameVisualRow(inputRect, textRect) {
  const tolerance = Math.max(24, Math.min(56, (inputRect.height + textRect.height) / 2 + 18));
  return Math.abs(rectCenterY(inputRect) - rectCenterY(textRect)) <= tolerance
    || (textRect.top <= inputRect.bottom + 6 && textRect.bottom >= inputRect.top - 6);
}

function bubbleCatalogHeaderBottom(headers) {
  return Math.max(
    headers.cod?.rect?.bottom || 0,
    headers.produto?.rect?.bottom || 0,
    headers.fracionamento?.rect?.bottom || 0,
    headers.valor?.rect?.bottom || 0
  );
}

function isBubbleRectInRowBand(rect, meta, tolerance = 8) {
  const top = meta?.rowTop ?? meta?.priceInput?.getBoundingClientRect?.().top ?? 0;
  const bottom = meta?.rowBottom ?? meta?.priceInput?.getBoundingClientRect?.().bottom ?? 0;
  return rect.bottom >= top - tolerance && rect.top <= bottom + tolerance;
}

function getBubbleCatalogProductBounds(headers, fallbackRight = window.innerWidth || 99999) {
  return {
    left: Math.max(0, (headers.produto?.rect?.left || 0) - 24),
    right: (headers.fracionamento?.rect?.left || fallbackRight) - 4,
  };
}

function buildBubbleCatalogTextRows(headers) {
  const headerBottom = bubbleCatalogHeaderBottom(headers);
  const productBounds = getBubbleCatalogProductBounds(headers);
  const codeRight = headers.produto?.rect?.left
    ? headers.produto.rect.left - 8
    : Math.max(headers.cod?.rect?.right || 0, 220);
  const codeItems = headers.items
    .filter(item => item.rect.top >= headerBottom - 8)
    .filter(item => item.rect.left <= codeRight)
    .map(item => ({ ...item, ean: limparEAN(item.text) }))
    .filter(item => item.ean)
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

  const rows = [];
  const seen = new Set();
  for (let i = 0; i < codeItems.length; i++) {
    const code = codeItems[i];
    const nextCode = codeItems.slice(i + 1).find(item => item.rect.top > code.rect.top + 10);
    const rowTop = Math.max(headerBottom, code.rect.top - 8);
    const rowBottom = nextCode
      ? Math.max(rowTop + 22, nextCode.rect.top - 7)
      : Math.max(code.rect.bottom + 44, code.rect.bottom + code.rect.height + 20);
    const rowTexts = headers.items
      .filter(item => item.rect.top >= rowTop - 3 && item.rect.top < rowBottom + 3)
      .filter(item => !isBubbleIgnoredRowText(item.text));
    const productParts = rowTexts
      .filter(item => /[A-Za-zÀ-ú]{3}/.test(item.text))
      .filter(item => !limparEAN(item.text))
      .filter(item => item.rect.left >= productBounds.left && item.rect.left < productBounds.right)
      .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)
      .map(item => item.text.trim())
      .filter((text, index, all) => text && all.indexOf(text) === index);
    const fallbackProductParts = rowTexts
      .filter(item => /[A-Za-zÀ-ú]{3}/.test(item.text))
      .filter(item => !limparEAN(item.text))
      .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)
      .map(item => item.text.trim())
      .filter((text, index, all) => text && all.indexOf(text) === index);
    const nome = (productParts.length ? productParts : fallbackProductParts).join(' ').trim();
    if (!nome) continue;

    const meta = {
      ean: code.ean,
      nome,
      rowTop,
      rowBottom,
      fractionInput: null,
      priceInput: null,
      signature: `${code.ean}|${normalizeRowKey(nome)}|${Math.round(rowTop)}`,
    };
    if (seen.has(meta.signature)) continue;
    bubbleCatalogRowMeta.set(meta, meta);
    rows.push(meta);
    seen.add(meta.signature);
  }
  return rows;
}

function isBubbleValorControl(control, headers) {
  const rect = control.getBoundingClientRect();
  const valueRect = headers.valor?.rect || null;
  const fractionRect = headers.fracionamento?.rect || null;
  const cx = rectCenterX(rect);

  if (valueRect) {
    const valueCx = rectCenterX(valueRect);
    const valueDistance = Math.abs(cx - valueCx);
    if (fractionRect) {
      const fractionDistance = Math.abs(cx - rectCenterX(fractionRect));
      if (fractionDistance <= valueDistance || cx <= fractionRect.right + 12) return false;
    }
    return valueDistance <= Math.max(130, valueRect.width + 110) || cx >= valueRect.left - 16;
  }

  if (fractionRect && cx <= rectCenterX(fractionRect) + 32) return false;
  return true;
}

function isBubbleFracionamentoControl(control, headers) {
  const rect = control.getBoundingClientRect();
  const fractionRect = headers.fracionamento?.rect || null;
  if (!fractionRect) return false;

  const valueRect = headers.valor?.rect || null;
  const cx = rectCenterX(rect);
  if (valueRect && cx >= valueRect.left - 12) return false;

  const fractionCx = rectCenterX(fractionRect);
  return Math.abs(cx - fractionCx) <= Math.max(130, fractionRect.width + 110)
    || (cx >= fractionRect.left - 16 && (!valueRect || cx < valueRect.left - 12));
}

function buildBubbleCatalogRowMeta(priceInput, headers) {
  const inputRect = priceInput.getBoundingClientRect();
  const headerBottom = bubbleCatalogHeaderBottom(headers);
  const productBounds = getBubbleCatalogProductBounds(headers, inputRect.left);

  const rowTexts = headers.items
    .filter(item => item.rect.top >= headerBottom - 8)
    .filter(item => item.rect.left < inputRect.left - 6)
    .filter(item => isBubbleSameVisualRow(inputRect, item.rect))
    .filter(item => !isBubbleIgnoredRowText(item.text))
    .sort((a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top);

  const eanSource = rowTexts.find(item => limparEAN(item.text))?.text || '';
  const ean = limparEAN(eanSource);
  const productParts = rowTexts
    .filter(item => /[A-Za-zÀ-ú]{3}/.test(item.text))
    .filter(item => !limparEAN(item.text))
    .filter(item => item.rect.left >= productBounds.left && item.rect.left < productBounds.right)
    .map(item => item.text.trim())
    .filter((text, index, all) => text && all.indexOf(text) === index);

  const fallbackProductParts = rowTexts
    .filter(item => /[A-Za-zÀ-ú]{3}/.test(item.text))
    .filter(item => !limparEAN(item.text))
    .map(item => item.text.trim())
    .filter((text, index, all) => text && all.indexOf(text) === index);

  const nome = (productParts.length ? productParts : fallbackProductParts).join(' ').trim();
  if (!ean && !nome) return null;

  return {
    ean,
    nome,
    fractionInput: null,
    priceInput,
    rowTop: inputRect.top - 8,
    rowBottom: inputRect.bottom + 8,
    signature: `${ean}|${normalizeRowKey(nome)}|${Math.round(inputRect.top)}`,
  };
}

function findBubbleCatalogFractionTarget(meta, headers) {
  if (meta?.fractionInput && isVisible(meta.fractionInput)) return meta.fractionInput;

  const controls = getBubbleCatalogEditableControls(document.body)
    .filter(control => isBubbleFracionamentoControl(control, headers))
    .map(control => ({ el: control, rect: control.getBoundingClientRect() }))
    .filter(item => isBubbleRectInRowBand(item.rect, meta))
    .sort((a, b) => (
      Math.abs(rectCenterY(a.rect) - ((meta.rowTop + meta.rowBottom) / 2))
      - Math.abs(rectCenterY(b.rect) - ((meta.rowTop + meta.rowBottom) / 2))
    ));

  if (controls[0]?.el) {
    meta.fractionInput = controls[0].el;
    return controls[0].el;
  }

  return null;
}

function findBubbleCatalogPriceTarget(meta, headers) {
  if (meta?.priceInput && isVisible(meta.priceInput) && isEditableValueControl(meta.priceInput)) {
    return meta.priceInput;
  }

  const controls = getBubbleCatalogEditableControls(document.body)
    .filter(control => isBubbleValorControl(control, headers))
    .map(control => ({ el: control, rect: control.getBoundingClientRect() }))
    .filter(item => isBubbleRectInRowBand(item.rect, meta))
    .sort((a, b) => (
      Math.abs(rectCenterY(a.rect) - ((meta.rowTop + meta.rowBottom) / 2))
      - Math.abs(rectCenterY(b.rect) - ((meta.rowTop + meta.rowBottom) / 2))
    ));
  if (controls[0]?.el) {
    meta.priceInput = controls[0].el;
    return controls[0].el;
  }

  const valueLeft = (headers.valor?.rect?.left || headers.fracionamento?.rect?.right || 0) - 24;
  const valueCenter = headers.valor?.rect ? rectCenterX(headers.valor.rect) : valueLeft;
  const valueTargets = headers.items
    .filter(item => isBubbleRectInRowBand(item.rect, meta, 12))
    .filter(item => item.rect.left >= valueLeft)
    .filter(item => item.loose === 'r$' || item.loose === 'rs' || /r\$/i.test(item.text))
    .sort((a, b) => Math.abs(rectCenterX(a.rect) - valueCenter) - Math.abs(rectCenterX(b.rect) - valueCenter));
  if (valueTargets[0]?.el) {
    meta.priceInput = valueTargets[0].el;
    return valueTargets[0].el;
  }

  return null;
}

function getBubbleCatalogPriceCandidates(row) {
  const headers = getBubbleCatalogHeaders();
  const meta = bubbleCatalogRowMeta.get(row);
  if (meta) {
    const target = findBubbleCatalogPriceTarget(meta, headers);
    return target ? [target] : [];
  }

  const root = row?.querySelectorAll ? row : document.body;
  const controls = getBubbleCatalogEditableControls(root)
    .filter(control => isBubbleValorControl(control, headers));
  return controls.length ? [controls[0]] : [];
}

function getBubbleCatalogRows() {
  const headers = getBubbleCatalogHeaders();
  const textRows = buildBubbleCatalogTextRows(headers);
  if (textRows.length) return textRows;

  const headerBottom = bubbleCatalogHeaderBottom(headers);
  const controls = getBubbleCatalogEditableControls(document.body)
    .filter(control => {
      const rect = control.getBoundingClientRect();
      return rect.top >= headerBottom - 8 && isBubbleValorControl(control, headers);
    });

  const rows = [];
  const seen = new Set();
  for (const control of controls) {
    const meta = buildBubbleCatalogRowMeta(control, headers);
    if (!meta || seen.has(meta.signature)) continue;
    bubbleCatalogRowMeta.set(control, meta);
    rows.push(control);
    seen.add(meta.signature);
  }
  return rows;
}

function getBubbleCatalogRowMeta(row) {
  return bubbleCatalogRowMeta.get(row)
    || (row && typeof row === 'object' && ('rowTop' in row || 'ean' in row || 'nome' in row) ? row : null);
}

function getBubbleCatalogSignatureParts(signature) {
  const parts = String(signature || '').split('|');
  return {
    ean: limparEAN(parts[0] || ''),
    nomeKey: normalizeRowKey(parts[1] || ''),
    rowTop: Number(parts[parts.length - 1]),
  };
}

function getBubbleCatalogItemIdentity(item = {}, fallbackMeta = null) {
  const signature = getBubbleCatalogSignatureParts(item.signature);
  return {
    ean: limparEAN(item.ean || fallbackMeta?.ean || signature.ean || ''),
    nomeKey: normalizeRowKey(item.nome || fallbackMeta?.nome || signature.nomeKey || ''),
    rowTop: Number.isFinite(signature.rowTop) ? signature.rowTop : Number(fallbackMeta?.rowTop),
  };
}

function bubbleCatalogNameMatchScore(wantedName, candidateName) {
  if (!wantedName || !candidateName) return 0;
  if (wantedName === candidateName) return 80;
  if (wantedName.length >= 10 && candidateName.includes(wantedName)) return 56;
  if (candidateName.length >= 10 && wantedName.includes(candidateName)) return 48;
  return 0;
}

function scoreBubbleCatalogMetaForItem(meta, identity) {
  if (!meta) return 0;
  let score = 0;
  let identityMatched = false;
  const metaEan = limparEAN(meta.ean || '');
  const metaName = normalizeRowKey(meta.nome || '');

  if (identity.ean && metaEan && identity.ean === metaEan) {
    score += 120;
    identityMatched = true;
  }

  const nameScore = bubbleCatalogNameMatchScore(identity.nomeKey, metaName);
  if (nameScore > 0) {
    score += nameScore;
    identityMatched = true;
  }

  if (!identityMatched) return 0;

  if (Number.isFinite(identity.rowTop) && Number.isFinite(Number(meta.rowTop))) {
    const distance = Math.abs(Number(meta.rowTop) - identity.rowTop);
    score += Math.max(0, 30 - distance / 4);
  }

  return score;
}

function findBubbleCatalogCurrentRowForItem(item, fallbackRow, options = {}) {
  const fallbackMeta = getBubbleCatalogRowMeta(fallbackRow);
  const identity = getBubbleCatalogItemIdentity(item, fallbackMeta);
  const requireExactEan = Boolean(options.requireExactEan);
  if (requireExactEan && !identity.ean) return null;

  const candidates = getBubbleCatalogRows()
    .map(row => ({ row, meta: getBubbleCatalogRowMeta(row) }))
    .filter(candidate => candidate.meta)
    .map(candidate => ({ ...candidate, score: scoreBubbleCatalogMetaForItem(candidate.meta, identity) }))
    .filter(candidate => !requireExactEan || limparEAN(candidate.meta.ean || '') === identity.ean)
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.row || (requireExactEan ? null : fallbackRow || null);
}

function findBubbleCatalogVisualMetaForItem(item, fallbackMeta = null, headers = getBubbleCatalogHeaders()) {
  const identity = getBubbleCatalogItemIdentity(item, fallbackMeta);
  const matches = headers.items
    .filter(textItem => !isBubbleIgnoredRowText(textItem.text))
    .map(textItem => {
      const ean = limparEAN(textItem.text);
      const nameKey = normalizeRowKey(textItem.text);
      let score = 0;
      if (identity.ean && ean && identity.ean === ean) score += 120;
      score += bubbleCatalogNameMatchScore(identity.nomeKey, nameKey);
      if (Number.isFinite(identity.rowTop)) {
        const distance = Math.abs(textItem.rect.top - identity.rowTop);
        score += Math.max(0, 20 - distance / 5);
      }
      return { textItem, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = matches[0]?.textItem;
  if (!best) return fallbackMeta;

  return {
    ean: identity.ean,
    nome: item.nome || fallbackMeta?.nome || best.text,
    rowTop: Math.max(bubbleCatalogHeaderBottom(headers), best.rect.top - 14),
    rowBottom: best.rect.bottom + 32,
    fractionInput: fallbackMeta?.fractionInput || null,
    priceInput: fallbackMeta?.priceInput || null,
    signature: item.signature || fallbackMeta?.signature || '',
  };
}

function bubbleCatalogValueLeft(headers) {
  return (headers.valor?.rect?.left || headers.fracionamento?.rect?.right || 0) - 24;
}

function bubbleCatalogRowShowsPrice(row, expectedPrice, samePriceLike, item = null) {
  const headers = getBubbleCatalogHeaders();
  const meta = getBubbleCatalogRowMeta(row);
  const visualMeta = findBubbleCatalogVisualMetaForItem(item || {}, meta, headers);
  const activeMeta = visualMeta || meta;
  if (!activeMeta) return false;

  const target = findBubbleCatalogPriceTarget(activeMeta, headers);
  if (target && samePriceLike(getControlValue(target), expectedPrice)) return true;

  const valueLeft = bubbleCatalogValueLeft(headers);
  return headers.items
    .filter(textItem => isBubbleRectInRowBand(textItem.rect, activeMeta, 18))
    .filter(textItem => textItem.rect.left >= valueLeft)
    .some(textItem => samePriceLike(textItem.text, expectedPrice));
}

function getRedeFornecedoresPriceCandidates(row) {
  const cells = Array.from(row.querySelectorAll('td, th'));
  const inputs = getEditableInputs(row).filter(input => {
    const cell = input.closest('td, th');
    const cellIndex = cell ? cells.indexOf(cell) : -1;
    const cellText = cell?.textContent || '';
    const meta = `${input.name || ''} ${input.id || ''} ${input.className || ''} ${input.placeholder || ''} ${input.getAttribute('aria-label') || ''}`.toLowerCase();

    if (/equivalente|ofertar|pesquisa|search|buscar|codigo|c[oó]d|barras|produto|emb|pedido|qtd/.test(meta)) return false;
    if (/produto\s+equivalente|ofertar\s+produto|\ba[çc][aã]o\b/i.test(cellText)) return false;
    if (cellIndex >= 0 && cellIndex <= 4) return false;
    return true;
  });
  const priceLike = inputs.filter(isPriceLikeInput);
  return priceLike.length ? priceLike : inputs;
}

function getIntersolidPriceCandidates(row) {
  const cells = getDirectCells(row);
  const costColumnIndex = findColumnIndexByHeader(
    row,
    [/valor\s+de\s+custo/i, /^\s*custo\s*$/i],
    [/desconto|acr[eé]scimo|acrescimo|ipi|substitui|final/i]
  );

  if (costColumnIndex >= 0) {
    const costInputs = getEditableInputs(cells[costColumnIndex] || row);
    if (costInputs.length) return costInputs;
  }

  const inputs = getEditableInputs(row).filter(input => {
    const cellText = normalizeCellText(input.closest('td, th')?.textContent || '');
    const meta = `${input.name || ''} ${input.id || ''} ${input.className || ''} ${input.placeholder || ''} ${input.getAttribute('aria-label') || ''}`.toLowerCase();
    return !/desconto|acr[eé]scimo|acrescimo|ipi|substitui|final|data/.test(`${meta} ${cellText}`);
  });

  return inputs.length ? [inputs[0]] : [];
}

function getCotacaoWebSmusPriceCandidates(row) {
  const priceCell = getCotacaoWebSmusPriceCell(row);
  if (priceCell) {
    const controls = getEditableControls(priceCell || row);
    if (controls.length) return controls;
    if (priceCell && isVisible(priceCell)) return [priceCell];
  }

  const controls = getEditableControls(row).filter(input => {
    const meta = `${input.name || ''} ${input.id || ''} ${input.className || ''} ${input.placeholder || ''} ${input.getAttribute('aria-label') || ''}`.toLowerCase();
    const cellText = normalizeCellText(input.closest('td, th')?.textContent || '');
    return !/codigo|c[oó]d|ean|produto|nome|quant|qtd|embalagem|tamanho|frete|data|total|mensagem|observa|fornecedor/.test(`${meta} ${cellText}`);
  });
  const priceLike = controls.filter(isPriceLikeInput);
  return priceLike.length ? priceLike : controls;
}

function getCotacaoWebSmusPriceCell(row) {
  const cells = getDirectCells(row);
  const priceColumnIndex = findVisualColumnIndexByHeader(
    row,
    [/pre[çc]o\s*un\b/i, /pre[çc]o\s+unit/i, /^\s*pre[çc]o\s*$/i],
    [/total|frete|embalagem|quantidade|tamanho|mensagem|observa/i]
  );

  if (priceColumnIndex >= 0) {
    return markCotacaoWebSmusPriceCell(getCellAtVisualColumn(row, priceColumnIndex), 100, 'header_preco_un');
  }

  const priceControls = getEditableControls(row).filter(input => {
    const meta = `${input.name || ''} ${input.id || ''} ${input.className || ''} ${input.placeholder || ''} ${input.getAttribute('aria-label') || ''}`.toLowerCase();
    const cellText = normalizeCellText(input.closest('td, th')?.textContent || '').toLowerCase();
    const context = `${meta} ${cellText}`;
    return /(preco|preço|valor|vlr|unit)/.test(context)
      && !/(total|mensagem|observa|fornecedor|produto|ean|c[oó]d|codigo|quant|qtd|embalagem|tamanho|frete|data)/i.test(context);
  });

  const controlCell = priceControls[0]?.closest?.('td, th');
  if (controlCell) return markCotacaoWebSmusPriceCell(controlCell, 90, 'price_control_meta');

  return null;
}

function getVrCotacaoPriceCandidates(row) {
  const custoInputs = Array.from(row.querySelectorAll('input[name^="custo["]'))
    .filter(input => !input.disabled && !input.readOnly && isVisible(input));
  return custoInputs.length ? custoInputs : getEditableInputs(row);
}

function getPriceCandidates(row, site = 'generic') {
  if (site === 'rede-fornecedores') return getRedeFornecedoresPriceCandidates(row);
  if (site === 'intersolid-cotacao') return getIntersolidPriceCandidates(row);
  if (site === 'cotacao-web-smus') return getCotacaoWebSmusPriceCandidates(row);
  if (site === 'bubble-catalog-fornecedor') return getBubbleCatalogPriceCandidates(row);
  if (site === 'hipcomerp-cotacao') return getHipcomerpPriceCandidates(row);
  if (site === 'easy-cotacao-web') return getEasyCotacaoPriceCandidates(row);
  if (site === 'estancia-cotacao') return getEstanciaPriceCandidates(row);
  if (site === 'sg-cotacao') return getSgCotacaoPriceCandidates(row);
  if (site === 'hr-cotacao') return getHrCotacaoPriceCandidates(row);
  if (site === 'vr-cotacao') return getVrCotacaoPriceCandidates(row);
  const inputs = getEditableInputs(row);
  const priceLike = inputs.filter(isPriceLikeInput);
  return priceLike.length ? priceLike : inputs;
}

function getSelectedPriceInput(row, empresaColuna, site = 'generic') {
  const candidates = getPriceCandidates(row, site);
  return candidates[normalizeEmpresaColuna(empresaColuna)] || null;
}

function detectQuotationSite() {
  const path = window.location.pathname || '';
  const hostname = window.location.hostname || '';
  const bodyText = document.body?.innerText || '';
  const looksInfomagCotacao = /Descri[çc][ãa]o\s+Produto/i.test(bodyText)
    && /\bEAN\b/i.test(bodyText)
    && /Valor\s+Coleta/i.test(bodyText);
  const looksRedeFornecedores = /\bREDE\s+DE\s+FORNECEDORES\b/i.test(bodyText)
    || (/\bPRODUTOS\s+COTA[ÇC][ÃA]O\b/i.test(bodyText)
      && /Cod\.?\s*Barras/i.test(bodyText)
      && /Produto\s+Equivalente/i.test(bodyText));
  const looksIntersolidCotacao = /\bINTERSOLID\b/i.test(bodyText)
    || (/Informa[çc][õo]es\s+sobre\s+a\s+Cota[çc][ãa]o/i.test(bodyText)
      && /\bEmb\s+Compra\b/i.test(bodyText)
      && /Valor\s+de\s+Custo/i.test(bodyText));
  const looksCotacaoWebSmus = /\bCota[çc][ãa]o\s+Web\b/i.test(bodyText)
    && /\bPre[çc]o\s*UN\b/i.test(bodyText)
    && /\bMensagem\s+Fornecedor\b/i.test(bodyText);

  if (window.location.hostname.includes('cotatudo.com.br')) return 'cotatudo';
  if (isSgCotacaoPage(hostname, bodyText)) return 'sg-cotacao';
  if (isHrCotacaoPage(hostname)) return 'hr-cotacao';
  if (isAriusCotacaoPage(hostname)) return 'arius-cotacao';
  if (isBluesoftCotacaoPage(hostname)) return 'bluesoft-cotacao';
  if (isGuiaCotacaoPage(hostname, path)) return 'guia-cotacao';
  if (isHipcomerpCotacaoPage(hostname, bodyText)) return 'hipcomerp-cotacao';
  if (isEasyCotacaoWebPage(hostname, path, bodyText)) return 'easy-cotacao-web';
  if (isEstanciaCotacaoPage(hostname, path, bodyText)) return 'estancia-cotacao';
  if (isBubbleCatalogFornecedorPage(hostname, path, bodyText)) return 'bubble-catalog-fornecedor';
  if (/(^|\.)cotacaoweb\.smus\.com\.br$/i.test(hostname)
    && (/cotacaoweb/i.test(`${hostname}${path}${window.location.hash || ''}`) || looksCotacaoWebSmus)) return 'cotacao-web-smus';
  if (looksCotacaoWebSmus) return 'cotacao-web-smus';
  if (/(^|\.)intersolid\.com\.br$/i.test(hostname) && (/cotacao/i.test(hostname + path) || looksIntersolidCotacao)) return 'intersolid-cotacao';
  if (looksIntersolidCotacao) return 'intersolid-cotacao';
  if (/(^|\.)infomagcotacao\.com$/i.test(hostname)
    && (/\/cotacao\/?$/i.test(path) || looksInfomagCotacao)) return 'infomag-cotacao';
  if (looksInfomagCotacao) return 'infomag-cotacao';
  if (window.location.hostname.includes('fornecedor.rpinfo.com.br') && /\/supplier\/quotations\//i.test(path)) return 'rp-hub';
  if (/\bRP\s*HUB\b/i.test(bodyText) && /Valor\s+Unit[aá]rio/i.test(bodyText)) return 'rp-hub';
  if (looksRedeFornecedores) return 'rede-fornecedores';
  if (/(^|\.)rfd\.net\.br$/i.test(window.location.hostname)
    && (/\/cotacao\//i.test(path)
      || looksRedeFornecedores)) return 'rede-fornecedores';
  if (/\/php\/vrcotacao\/cotacao\.php/i.test(path) || /\bVR\s+COTA[ÇC][ÃA]O\b/i.test(bodyText)) return 'vr-cotacao';
  return 'generic';
}

function getQuotationRows(site) {
  if (site === 'cotatudo') {
    return Array.from(document.querySelectorAll('table#conteudo_gvItem tbody tr'));
  }

  if (site === 'sg-cotacao') {
    return getSgCotacaoRows();
  }

  if (site === 'hr-cotacao') {
    return getHrCotacaoRows();
  }

  if (site === 'vr-cotacao') {
    return Array.from(document.querySelectorAll('tr')).filter(row => {
      const text = row.textContent || '';
      return getEditableInputs(row).length > 0 && /\d{8,14}/.test(text) && /[A-Za-zÀ-ú]{3}/.test(text);
    });
  }

  if (site === 'rp-hub') {
    return Array.from(document.querySelectorAll('tr')).filter(row => {
      const text = row.textContent || '';
      return getPriceCandidates(row, site).length > 0 && /\d{8,14}/.test(text) && /[A-Za-zÀ-ú]{3}/.test(text);
    });
  }

  if (site === 'rede-fornecedores') {
    return Array.from(document.querySelectorAll('tr')).filter(row => {
      const text = row.textContent || '';
      return getPriceCandidates(row, site).length > 0 && /\d{8,14}/.test(text) && /[A-Za-zÀ-ú]{3}/.test(text);
    });
  }

  if (site === 'infomag-cotacao') {
    return Array.from(document.querySelectorAll('tr')).filter(row => {
      const text = row.textContent || '';
      return getPriceCandidates(row, site).length > 0 && /\d{8,14}/.test(text) && /[A-Za-zÀ-ú]{3}/.test(text);
    });
  }

  if (site === 'intersolid-cotacao') {
    return Array.from(document.querySelectorAll('tr')).filter(row => {
      const text = row.textContent || '';
      return getPriceCandidates(row, site).length > 0 && /\d{8,14}/.test(text) && /[A-Za-zÀ-ú]{3}/.test(text);
    });
  }

  if (site === 'cotacao-web-smus') {
    return Array.from(document.querySelectorAll('tr')).filter(isCotacaoWebSmusProductRow);
  }

  if (site === 'bubble-catalog-fornecedor') {
    return getBubbleCatalogRows();
  }

  if (site === 'hipcomerp-cotacao') {
    return getHipcomerpRows();
  }

  if (site === 'easy-cotacao-web') {
    return getEasyCotacaoRows();
  }

  if (site === 'estancia-cotacao') {
    return getEstanciaRows();
  }

  return Array.from(document.querySelectorAll('tr')).filter(row => getEditableInputs(row).length > 0);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForGridRender(delayMs = 35) {
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await sleep(delayMs);
}

function dispatchScrollEvent(el) {
  try {
    el.dispatchEvent(new Event('scroll', { bubbles: true }));
  } catch {}
}

function dispatchWheelEvent(el, deltaY) {
  try {
    el.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY,
      deltaMode: 0,
      view: window,
    }));
  } catch {}
}

function dispatchPageDown() {
  try {
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'PageDown', code: 'PageDown' }));
    document.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'PageDown', code: 'PageDown' }));
  } catch {}
}

function isScrollableY(el) {
  if (!el || el === document || el === window) return false;
  const style = window.getComputedStyle(el);
  const overflowY = `${style.overflowY || ''} ${style.overflow || ''}`;
  const looksScrollable = /(auto|scroll|overlay)/i.test(overflowY)
    || /\b(scroll|viewport|grid|body|content|panel|table)\b/i.test(`${el.className || ''} ${el.id || ''} ${el.getAttribute('role') || ''}`);
  return looksScrollable
    && el.scrollHeight > el.clientHeight + 20
    && el.getBoundingClientRect().height > 80;
}

function getCotacaoWebSmusVisibleRows() {
  return Array.from(document.querySelectorAll('tr')).filter(isCotacaoWebSmusProductRow);
}

function getCotacaoWebSmusScrollTargets() {
  const rows = getCotacaoWebSmusVisibleRows();
  const candidates = new Map();
  const scrollingElement = document.scrollingElement || document.documentElement || document.body;

  function makeTarget(el, score) {
    if (el === window) {
      const docEl = document.scrollingElement || document.documentElement || document.body;
      return {
        el: window,
        score,
        getTop: () => window.scrollY || docEl.scrollTop || document.body.scrollTop || 0,
        setTop: value => window.scrollTo(0, value),
        getMax: () => Math.max(0, docEl.scrollHeight - window.innerHeight),
        getHeight: () => window.innerHeight || docEl.clientHeight || 600,
        restore: value => window.scrollTo(0, value),
        dispatch: delta => {
          dispatchScrollEvent(window);
          dispatchWheelEvent(document.body || docEl, delta);
        },
      };
    }

    return {
      el,
      score,
      getTop: () => el.scrollTop || 0,
      setTop: value => { el.scrollTop = value; },
      getMax: () => Math.max(0, el.scrollHeight - el.clientHeight),
      getHeight: () => el.clientHeight || el.getBoundingClientRect().height || 240,
      restore: value => { el.scrollTop = value; },
      dispatch: delta => {
        dispatchScrollEvent(el);
        dispatchWheelEvent(el, delta);
      },
    };
  }

  function addCandidate(el) {
    if (!el || el === document || el === window) return;
    if (!isScrollableY(el) && el !== document.body && el !== document.documentElement && el !== scrollingElement) return;
    const rowsInside = rows.filter(row => el.contains(row)).length;
    const rect = el.getBoundingClientRect();
    const score = rowsInside * 1000
      + Math.min(el.scrollHeight - el.clientHeight, 20000) / 10
      + Math.min(rect.height, 600);
    candidates.set(el, Math.max(candidates.get(el) || 0, score || 1));
  }

  for (const row of rows) {
    let parent = row.parentElement;
    while (parent && parent !== document) {
      addCandidate(parent);
      parent = parent.parentElement;
    }
  }

  for (const el of document.querySelectorAll('div, section, main, article, tbody, table')) {
    addCandidate(el);
  }

  addCandidate(scrollingElement);
  candidates.set(window, Math.max(candidates.get(window) || 0, rows.length ? rows.length * 900 : 1));

  return Array.from(candidates.entries())
    .map(([el, score]) => makeTarget(el, score))
    .filter(target => target.getMax() > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

async function scanCotacaoWebSmusRows(onRow, options = {}) {
  const targets = getCotacaoWebSmusScrollTargets();
  const restoreScroll = options.restoreScroll !== false;
  const stopWhen = typeof options.stopWhen === 'function' ? options.stopWhen : null;
  const originalTops = targets.map(target => [target, target.getTop()]);
  const seen = new Map();

  async function visitVisibleRows() {
    const rows = getCotacaoWebSmusVisibleRows();
    for (const row of rows) {
      const signature = getCotacaoWebSmusRowSignature(row);
      if (!signature || seen.has(signature)) continue;
      const idx = seen.size;
      seen.set(signature, idx);
      const shouldStop = await onRow(row, idx, signature, targets[0]?.getTop() || 0);
      if (shouldStop) return true;
    }
    return false;
  }

  if (!targets.length) {
    await visitVisibleRows();
    return seen.size;
  }

  for (const target of targets) {
    target.setTop(0);
    target.dispatch(-1000);
  }
  await waitForGridRender(80);

  let stagnant = 0;
  const maxIterations = 2500;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    if (await visitVisibleRows()) break;
    if (stopWhen && stopWhen()) break;

    const beforeSeen = seen.size;
    const beforePositions = targets.map(target => target.getTop());
    const visibleRows = getCotacaoWebSmusVisibleRows();
    const lastVisibleRow = visibleRows[visibleRows.length - 1];
    let moved = false;

    if (lastVisibleRow) {
      try {
        lastVisibleRow.scrollIntoView({ block: 'end', inline: 'nearest' });
        moved = true;
      } catch {}
    }

    for (const target of targets) {
      const top = target.getTop();
      const maxTop = target.getMax();
      if (top >= maxTop - 2) continue;
      const step = Math.max(160, Math.floor(target.getHeight() * 0.92));
      const nextTop = Math.min(maxTop, top + step);
      if (Math.abs(nextTop - top) < 1) continue;

      target.setTop(nextTop);
      target.dispatch(step);
      moved = true;
    }

    dispatchPageDown();
    await waitForGridRender(iteration < 5 ? 120 : 45);
    await visitVisibleRows();

    const positionsChanged = targets.some((target, index) => Math.abs(target.getTop() - beforePositions[index]) > 1);
    if (!moved && !positionsChanged && seen.size === beforeSeen) {
      stagnant++;
    } else if (seen.size > beforeSeen) {
      stagnant = 0;
    } else {
      stagnant++;
    }

    if (stagnant >= 8 && targets.every(target => target.getTop() >= target.getMax() - 2)) break;
    if (stagnant >= 20 && !positionsChanged) break;
  }

  await visitVisibleRows();

  if (restoreScroll) {
    for (const [target, top] of originalTops) {
      target.restore(top);
      target.dispatch(0);
    }
  }

  return seen.size;
}

function extractItemFromRow(row, idx, site, empresaColuna) {
  if (site === 'sg-cotacao') {
    const ean = getSgCotacaoEan(row);
    const nome = normalizeCellText(getSgCotacaoCell(row, 'Produto')?.textContent || '');
    if (!ean && !nome) return null;
    const priceTarget = getSelectedPriceInput(row, empresaColuna, site);
    return {
      idx,
      ean,
      nome,
      codigo: '',
      signature: '',
      filled: priceTarget ? isFilledPriceValue(getControlValue(priceTarget).trim()) : false,
      current_price: currentPriceValue(priceTarget),
    };
  }

  if (site === 'hr-cotacao') {
    const ean = getHrCotacaoEan(row);
    const nome = getHrCotacaoNome(row);
    if (!ean && !nome) return null;
    const priceTarget = getSelectedPriceInput(row, empresaColuna, site);
    return {
      idx,
      ean,
      nome,
      codigo: normalizeCellText(getHrCotacaoCell(row, 'codigoPlu')?.textContent || ''),
      signature: '',
      filled: priceTarget ? isFilledPriceValue(getControlValue(priceTarget).trim()) : false,
      current_price: currentPriceValue(priceTarget),
    };
  }

  if (site === 'easy-cotacao-web') {
    const meta = easyCotacaoRowMeta.get(row) || parseEasyCotacaoRowMeta(row);
    if (!meta || (!meta.ean && !meta.nome)) return null;
    const priceTarget = getSelectedPriceInput(row, empresaColuna, site);
    return {
      idx,
      ean: meta.ean || '',
      nome: meta.nome || '',
      codigo: meta.codigo || '',
      signature: meta.signature || '',
      filled: priceTarget ? isFilledPriceValue(getControlValue(priceTarget).trim()) : false,
      current_price: currentPriceValue(priceTarget),
    };
  }

  if (site === 'hipcomerp-cotacao') {
    const meta = hipcomerpRowMeta.get(row) || parseHipcomerpCardMeta(row);
    if (!meta || (!meta.ean && !meta.nome)) return null;
    const priceTarget = getSelectedPriceInput(row, empresaColuna, site);
    return {
      idx,
      ean: meta.ean || '',
      nome: meta.nome || '',
      codigo: meta.codigo || '',
      signature: meta.signature || '',
      filled: priceTarget ? isFilledPriceValue(getControlValue(priceTarget).trim()) : false,
      current_price: currentPriceValue(priceTarget),
    };
  }

  if (site === 'bubble-catalog-fornecedor') {
    const meta = bubbleCatalogRowMeta.get(row);
    if (!meta || (!meta.ean && !meta.nome)) return null;
    const priceTarget = getSelectedPriceInput(row, empresaColuna, site);
    return {
      idx,
      ean: meta.ean || '',
      nome: meta.nome || '',
      codigo: '',
      signature: meta.signature || '',
      filled: priceTarget ? isFilledPriceValue(getControlValue(priceTarget).trim()) : false,
      current_price: currentPriceValue(priceTarget),
    };
  }

  if (site === 'estancia-cotacao') {
    const meta = estanciaRowMeta.get(row) || parseEstanciaRowMeta(row);
    if (!meta || (!meta.ean && !meta.nome)) return null;
    estanciaRowMeta.set(row, meta);
    return {
      idx,
      ean: meta.ean || '',
      nome: meta.nome || '',
      codigo: meta.codigo || '',
      signature: meta.signature || '',
      embalagem: String(meta.packageQty || 1),
      qtdEmbalagem: meta.packageQty || 1,
      filled: meta.priceInput ? isFilledPriceValue(getControlValue(meta.priceInput).trim()) : false,
      current_price: currentPriceValue(meta.priceInput),
    };
  }

  const priceInput = getSelectedPriceInput(row, empresaColuna, site);
  if (!priceInput && site !== 'cotacao-web-smus') return null;

  const ean = extractEANFromRow(row, site);
  const nome = extractProductNameFromRow(row);

  return {
    idx,
    ean,
    nome,
    codigo: site === 'cotacao-web-smus' ? getCotacaoWebSmusCodigo(row) : '',
    signature: site === 'cotacao-web-smus' ? getCotacaoWebSmusRowSignature(row) : '',
    filled: priceInput ? isFilledPriceValue(getControlValue(priceInput).trim()) : false,
    current_price: currentPriceValue(priceInput),
  };
}

async function extractCotacaoWebSmusItems(options = {}) {
  const items = [];
  const empresaColuna = normalizeEmpresaColuna(options.empresaColuna);

  await scanCotacaoWebSmusRows((row, idx) => {
    const item = extractItemFromRow(row, idx, 'cotacao-web-smus', empresaColuna);
    if (item) items.push(item);
    return false;
  });

  return items.map((item, idx) => ({ ...item, idx }));
}

async function extractQuotationItems(options = {}) {
  const site = detectQuotationSite();
  if (site === 'arius-cotacao') {
    return extractAriusItems();
  }
  if (site === 'bluesoft-cotacao') {
    return extractBluesoftItems();
  }
  if (site === 'guia-cotacao') {
    return extractGuiaItems();
  }
  if (site === 'cotacao-web-smus') {
    return extractCotacaoWebSmusItems(options);
  }
  if (site === 'hipcomerp-cotacao' && hipcomerpApiState.ready) {
    const apiResult = await loadHipcomerpApiItems({ waitMs: 500 });
    if (apiResult.ok && apiResult.items?.length) return apiResult.items;
  }

  const rows = getQuotationRows(site);
  const items = [];
  const empresaColuna = normalizeEmpresaColuna(options.empresaColuna);

  for (let i = 0; i < rows.length; i++) {
    const item = extractItemFromRow(rows[i], i, site, empresaColuna);
    if (item) items.push(item);
  }

  return items;
}

async function fillQuotationPrices(prices, options = {}) {
  const site = detectQuotationSite();
  if (site === 'arius-cotacao') {
    return fillAriusPrices(prices);
  }
  if (site === 'bluesoft-cotacao') {
    return fillBluesoftPrices(prices);
  }
  if (site === 'guia-cotacao') {
    return fillGuiaPrices(prices);
  }
  const rows = getQuotationRows(site);
  let count = 0;
  const failed = [];
  const details = [];
  const empresaColuna = normalizeEmpresaColuna(options.empresaColuna);

  function parsePriceNumber(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    let normalized = raw.replace(/[^\d,.-]/g, '');
    if (normalized.includes(',') && normalized.includes('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else if (normalized.includes(',')) {
      normalized = normalized.replace(',', '.');
    }
    const n = Number(normalized);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function priceValueCandidates(value, input) {
    const raw = String(value ?? '').replace(/^R\$\s*/i, '').trim();
    const n = parsePriceNumber(raw);
    if (!n) return raw ? [raw] : [];

    const dot = n.toFixed(2);
    const comma = dot.replace('.', ',');
    const dot3 = n.toFixed(3);
    const comma3 = dot3.replace('.', ',');
    const noDecimalsDot = String(n);
    const type = String(input.getAttribute('type') || '').toLowerCase();
    const candidates = site === 'intersolid-cotacao'
      ? (type === 'number'
        ? [dot3, dot, noDecimalsDot, comma3, comma, raw]
        : [comma3, comma, dot3, dot, raw, noDecimalsDot])
      : site === 'sg-cotacao'
        ? (type === 'number'
          ? [dot, noDecimalsDot, comma, comma3, raw]
          : [comma, dot, comma3, dot3, raw, noDecimalsDot])
      : site === 'hr-cotacao'
        ? [comma, dot, comma3, dot3, raw, noDecimalsDot]
      : site === 'estancia-cotacao'
        ? (type === 'number'
          ? [dot, noDecimalsDot, comma, raw]
          : [dot, comma, raw, noDecimalsDot])
      : site === 'hipcomerp-cotacao'
        ? (type === 'number'
          ? [dot, noDecimalsDot, comma, raw]
          : [comma, `R$ ${comma}`, dot, raw, noDecimalsDot])
      : (type === 'number'
        ? [dot, noDecimalsDot, comma, raw]
        : [comma, dot, raw, noDecimalsDot]);

    return candidates.filter((candidate, index) => (
      candidate && candidates.indexOf(candidate) === index
    ));
  }

  function hasPrice(value) {
    return parsePriceNumber(value) !== null;
  }

  function samePriceLike(a, b) {
    const priceA = parsePriceNumber(a);
    const priceB = parsePriceNumber(b);
    return priceA !== null && priceB !== null && Math.abs(priceA - priceB) < 0.01;
  }

  function cotacaoWebSmusRowShowsPrice(row, expectedValue) {
    const priceCell = getCotacaoWebSmusPriceCell(row);
    if (!priceCell) return false;
    const cellValue = normalizeCellText(priceCell.textContent || '');
    if (samePriceLike(cellValue, expectedValue)) return true;
    return getEditableControls(priceCell).some(control => samePriceLike(getControlValue(control), expectedValue));
  }

  function waitForSmusBridgeResult(requestId, timeoutMs = 1000) {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        document.removeEventListener('venpro-smus-fill-result', onResult);
        resolve({ ok: false, reason: 'bridge_timeout' });
      }, timeoutMs);

      function onResult(event) {
        let data = {};
        try { data = JSON.parse(event.detail || '{}'); } catch {}
        if (data.requestId !== requestId) return;
        clearTimeout(timer);
        document.removeEventListener('venpro-smus-fill-result', onResult);
        resolve(data);
      }

      document.addEventListener('venpro-smus-fill-result', onResult);
    });
  }

  let smusBridgeLoadPromise = null;

  async function ensureSmusPageBridge() {
    if (document.documentElement.getAttribute('data-venpro-smus-bridge') === 'ready') return true;
    if (smusBridgeLoadPromise) return smusBridgeLoadPromise;

    smusBridgeLoadPromise = new Promise(resolve => {
      const script = document.createElement('script');
      script.id = 'venpro-smus-page-bridge';
      script.src = chrome.runtime.getURL('smus-page-bridge.js');
      script.onload = () => resolve(true);
      script.onerror = () => {
        script.remove();
        smusBridgeLoadPromise = null;
        resolve(false);
      };
      (document.head || document.documentElement).appendChild(script);
    });

    return smusBridgeLoadPromise;
  }

  async function fillCotacaoWebSmusViaBridge(row, input, item) {
    const bridgeReady = await ensureSmusPageBridge();
    if (!bridgeReady) return { ok: false, reason: 'bridge_injection_failed' };

    const rowToken = `r${Date.now()}${Math.random().toString(16).slice(2)}`;
    const cellToken = `c${Date.now()}${Math.random().toString(16).slice(2)}`;
    const priceCell = getCotacaoWebSmusPriceCell(row) || input;

    row.setAttribute('data-venpro-smus-row', rowToken);
    priceCell?.setAttribute?.('data-venpro-smus-cell', cellToken);

    const requestId = `q${Date.now()}${Math.random().toString(16).slice(2)}`;
    const resultPromise = waitForSmusBridgeResult(requestId, 1200);

    document.dispatchEvent(new CustomEvent('venpro-smus-fill-request', {
      detail: JSON.stringify({
        requestId,
        rowToken,
        cellToken,
        price: item.price,
        ean: item.ean || '',
        codigo: item.codigo || '',
        nome: item.nome || '',
        signature: item.signature || '',
      }),
    }));

    const result = await resultPromise;
    await waitForGridRender(120);
    row.removeAttribute('data-venpro-smus-row');
    priceCell?.removeAttribute?.('data-venpro-smus-cell');
    return result;
  }

  function dispatchInputEvents(input, value) {
    try {
      input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
    } catch {}
    try {
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    } catch {
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', code: 'Enter' }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', code: 'Enter' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Tab' }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    input.dispatchEvent(new Event('focusout', { bubbles: true }));
  }

  function writeNativeValue(input, value) {
    if (!input || !('value' in input)) {
      if (input) input.textContent = value;
      return;
    }

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;
    if (nativeInputValueSetter) nativeInputValueSetter.call(input, value);
    else input.value = value;
  }

  function selectEditableContents(el) {
    try {
      el.focus?.();
      if (typeof el.select === 'function') {
        el.select();
        return;
      }
      if (el.isContentEditable || el.getAttribute?.('role') === 'textbox') {
        const range = document.createRange();
        range.selectNodeContents(el);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } catch {}
  }

  async function commitEditorValue(el, value, delayMs = 45) {
    try {
      dispatchInputEvents(el, value);
      el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', code: 'Enter' }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', code: 'Enter' }));
      el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab', code: 'Tab' }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Tab', code: 'Tab' }));
      el.blur?.();
    } catch {}
    await waitForGridRender(delayMs);
  }

  async function writeEditableControlValue(el, value) {
    for (const candidate of priceValueCandidates(value, el)) {
      try {
        selectEditableContents(el);

        if ('value' in el) {
          writeNativeValue(el, '');
          el.dispatchEvent(new Event('input', { bubbles: true }));
          writeNativeValue(el, candidate);
        } else {
          try { document.execCommand?.('selectAll', false); } catch {}
          const inserted = document.execCommand?.('insertText', false, candidate);
          if (!inserted) el.textContent = candidate;
        }

        await commitEditorValue(el, candidate);
        if (hasPrice(getControlValue(el))) return true;
      } catch {}
    }
    return false;
  }

  async function setPlainControlValue(input, value) {
    input.scrollIntoView({ block: 'center', inline: 'nearest' });

    if (!isEditableValueControl(input)) {
      const nestedEditor = await activateNestedEditor(input);
      if (nestedEditor) return setPlainControlValue(nestedEditor, value);
      return false;
    }

    const nestedEditor = await activateNestedEditor(input);
    if (nestedEditor) return setPlainControlValue(nestedEditor, value);

    const plain = String(value ?? '').trim();
    if (!plain) return false;

    try {
      input.focus?.();
      selectEditableContents(input);

      if ('value' in input) {
        writeNativeValue(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        writeNativeValue(input, plain);
      } else {
        try { document.execCommand?.('selectAll', false); } catch {}
        const inserted = document.execCommand?.('insertText', false, plain);
        if (!inserted) input.textContent = plain;
      }

      await commitEditorValue(input, plain, 80);
      return parsePriceNumber(getControlValue(input)) !== null;
    } catch {}

    return false;
  }

  async function tryGridCellTyping(cell, value) {
    const fallback = priceValueCandidates(value, cell)[0];
    if (!fallback) return false;

    try {
      const beforeEditors = new Set(getEditableControls(document.body));
      cell.focus?.();
      cell.click?.();
      cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
      cell.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'F2', code: 'F2' }));
      cell.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'F2', code: 'F2' }));
      await waitForGridRender(50);

      const editor = findBestEditorNear(cell, beforeEditors);
      if (editor && editor !== cell && await writeEditableControlValue(editor, value)) return true;

      selectEditableContents(cell);
      try { document.execCommand?.('selectAll', false); } catch {}
      if (selectionBelongsToTarget(cell) && document.execCommand?.('insertText', false, fallback)) {
        await commitEditorValue(cell, fallback, 80);
        return true;
      }

      cell.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a', code: 'KeyA', ctrlKey: true }));
      cell.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a', code: 'KeyA', ctrlKey: true }));
      cell.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Backspace', code: 'Backspace' }));
      cell.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Backspace', code: 'Backspace' }));

      for (const ch of fallback) {
        cell.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ch }));
        cell.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: ch, charCode: ch.charCodeAt(0), keyCode: ch.charCodeAt(0) }));
        cell.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ch }));
        cell.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch }));
        cell.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ch }));
      }

      try {
        const data = new DataTransfer();
        data.setData('text/plain', fallback);
        cell.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
      } catch {}

      await commitEditorValue(cell, fallback, 60);
      return true;
    } catch {
      return false;
    }
  }

  function editableControlDistance(a, b) {
    try {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const ax = ar.left + ar.width / 2;
      const ay = ar.top + ar.height / 2;
      const bx = br.left + br.width / 2;
      const by = br.top + br.height / 2;
      return Math.abs(ax - bx) + Math.abs(ay - by);
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  }

  function selectionBelongsToTarget(target) {
    try {
      const active = document.activeElement;
      if (active && (active === target || target.contains(active))) return true;
      const selection = window.getSelection?.();
      if (!selection?.rangeCount) return false;
      const node = selection.anchorNode;
      const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
      return Boolean(el && (el === target || target.contains(el)));
    } catch {
      return false;
    }
  }

  function rectsOverlap(a, b) {
    try {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const overlapX = Math.max(0, Math.min(ar.right, br.right) - Math.max(ar.left, br.left));
      const overlapY = Math.max(0, Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top));
      const minWidth = Math.max(1, Math.min(ar.width, br.width));
      const minHeight = Math.max(1, Math.min(ar.height, br.height));
      return overlapX >= minWidth * 0.45 && overlapY >= minHeight * 0.45;
    } catch {
      return false;
    }
  }

  function editorBelongsToTarget(editor, target, beforeEditors = new Set()) {
    if (!editor || !target || !isEditableValueControl(editor) || !isVisible(editor)) return false;
    if (editor === target || target.contains(editor) || editor.contains(target)) return true;

    const targetRow = target.closest?.('tr');
    const editorRow = editor.closest?.('tr');
    if (targetRow && editorRow) return targetRow === editorRow;

    const targetTable = target.closest?.('table');
    const editorTable = editor.closest?.('table');
    if (targetTable && editorTable && targetTable !== editorTable) return false;

    const isNew = !beforeEditors.has(editor);
    const nearEnough = editableControlDistance(editor, target) < (isNew ? 150 : 90);
    return rectsOverlap(editor, target) || (isNew && nearEnough);
  }

  function findBestEditorNear(target, beforeEditors = new Set()) {
    if (target && isEditableValueControl(target) && isVisible(target)) {
      return target;
    }

    const active = document.activeElement;
    if (active && active !== target && editorBelongsToTarget(active, target, beforeEditors)) {
      return active;
    }

    const nested = getEditableControls(target)[0];
    if (nested && editorBelongsToTarget(nested, target, beforeEditors)) return nested;

    const editors = getEditableControls(document.body)
      .filter(el => el !== target)
      .filter(el => editorBelongsToTarget(el, target, beforeEditors))
      .map(el => ({
        el,
        isNew: beforeEditors.has(el) ? 0 : 1,
        distance: editableControlDistance(el, target),
      }))
      .sort((a, b) => b.isNew - a.isNew || a.distance - b.distance);

    return editors[0]?.el || null;
  }

  async function activateNestedEditor(input) {
    if (!input || 'value' in input || input.isContentEditable || input.getAttribute('role') === 'textbox') {
      return null;
    }

    const beforeEditors = new Set(getEditableControls(document.body));

    try {
      input.focus?.();
      input.click();
      input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      input.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      input.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      input.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'F2', code: 'F2' }));
      input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'F2', code: 'F2' }));
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', code: 'Enter' }));
      input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', code: 'Enter' }));
    } catch {}

    await waitForGridRender(90);

    return findBestEditorNear(input, beforeEditors);
  }

  // SG Cotação usa ng2-currency-mask: o NgModel só atualiza pelo handler da
  // máscara, e o único handler que relê o value do DOM é o de paste
  // (handlePaste → setTimeout(1) → updateFieldValue lê rawValue=input.value,
  // reaplica a máscara e chama onModelChange). Escrever o value e disparar
  // "input" pinta a tela mas deixa o model em 0 — o Gravar do site salvava 0.
  async function setSgCotacaoInputValue(input, value) {
    for (const candidate of priceValueCandidates(value, input)) {
      try {
        input.focus?.();
        if (typeof input.select === 'function') input.select();
        writeNativeValue(input, candidate);
        try {
          input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true }));
        } catch {
          input.dispatchEvent(new Event('paste', { bubbles: true, cancelable: true }));
        }
        await waitForGridRender(90);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        input.dispatchEvent(new Event('focusout', { bubbles: true }));
        await waitForGridRender(40);
        if (samePriceLike(getControlValue(input), value)) return true;
      } catch {}
    }
    return false;
  }

  // HR Cotação: a máscara ignora set programático de value, mas o commit
  // (keydown)="onKeyPressEvent" lê input.value cru em Enter/Tab/Setas e chama
  // updateVlr(input.value) -> salva no backend. Escrevemos o value nativo e
  // disparamos um keydown "Tab" sintético para forçar esse caminho.
  async function setHrCotacaoInputValue(input, value) {
    for (const candidate of priceValueCandidates(value, input)) {
      try {
        input.focus?.();
        if (typeof input.select === 'function') input.select();
        writeNativeValue(input, candidate);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: 'Tab',
          code: 'Tab',
        }));
        await waitForGridRender(160);
        if (samePriceLike(getControlValue(input), value)) return true;
      } catch {}
    }
    return false;
  }

  async function setInputValue(input, value) {
    input.scrollIntoView({ block: 'center', inline: 'nearest' });

    if (site === 'sg-cotacao') {
      return setSgCotacaoInputValue(input, value);
    }

    if (site === 'hr-cotacao') {
      return setHrCotacaoInputValue(input, value);
    }

    if (!isEditableValueControl(input)) {
      if (site === 'cotacao-web-smus') {
        return isSafeCotacaoWebSmusRawTarget(input) ? tryGridCellTyping(input, value) : false;
      }
      const nestedEditor = await activateNestedEditor(input);
      if (nestedEditor) return setInputValue(nestedEditor, value);
      return false;
    }

    const nestedEditor = await activateNestedEditor(input);
    if (nestedEditor) return setInputValue(nestedEditor, value);

    input.focus?.();

    if (await writeEditableControlValue(input, value)) return true;

    const fallback = priceValueCandidates(value, input)[0];
    if (!fallback) return false;

    try {
      input.focus?.();
      if (typeof input.select === 'function') input.select();
      document.execCommand?.('insertText', false, fallback);
      dispatchInputEvents(input, fallback);
      await waitForGridRender(20);
    } catch {}

    return hasPrice(getControlValue(input));
  }

  function normalizeBubbleCatalogFraction(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const match = raw.replace(/\s+/g, ' ').match(/\d+(?:[.,]\d+)?/);
    if (!match) return '';
    const n = Number(match[0].replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0 || n > 9999) return '';
    if (Math.abs(n - Math.round(n)) < 0.0001) return String(Math.round(n));
    return String(n).replace('.', ',');
  }

  function getBubbleCatalogFractionValue(item = {}) {
    return normalizeBubbleCatalogFraction(
      item.fracionamento
      ?? item.fraction
      ?? item.quantidade_caixa
      ?? item.quantidadeCaixa
      ?? item.qtd_caixa
      ?? ''
    ) || '1';
  }

  function getEasyCotacaoQuantityValue(item = {}) {
    return normalizeBubbleCatalogFraction(
      item.fracionamento
      ?? item.fraction
      ?? item.quantidade_caixa
      ?? item.quantidadeCaixa
      ?? item.qtd_caixa
      ?? ''
    ) || '1';
  }

  function sameBubbleCatalogFraction(current, desired) {
    const a = parsePriceNumber(current);
    const b = parsePriceNumber(desired);
    return a !== null && b !== null && Math.abs(a - b) < 0.0001;
  }

  function sameEasyCotacaoQuantity(current, desired) {
    return sameBubbleCatalogFraction(current, desired);
  }

  async function ensureBubbleCatalogFraction(row, item = {}) {
    const meta = bubbleCatalogRowMeta.get(row);
    if (!meta) return { ok: false, changed: false, reason: 'row_meta_not_found' };

    const target = findBubbleCatalogFractionTarget(meta, getBubbleCatalogHeaders());
    if (!target) return { ok: false, changed: false, reason: 'fraction_input_not_found' };

    const fracionamento = getBubbleCatalogFractionValue(item);
    const current = getControlValue(target);
    if (sameBubbleCatalogFraction(current, fracionamento)) {
      return { ok: true, changed: false, reason: 'fraction_already_filled', fracionamento };
    }

    const ok = await setPlainControlValue(target, fracionamento);
    await waitForGridRender(140);
    if (ok && meta.priceInput && !isEditableValueControl(meta.priceInput)) {
      meta.priceInput = null;
    }

    return { ok, changed: ok, reason: ok ? 'fraction_filled' : 'fraction_rejected', fracionamento };
  }

  async function ensureEasyCotacaoQuantity(row, item = {}) {
    const meta = easyCotacaoRowMeta.get(row) || parseEasyCotacaoRowMeta(row);
    if (!meta) return { ok: true, changed: false, reason: 'row_meta_not_found', fracionamento: '1' };

    easyCotacaoRowMeta.set(row, meta);
    const target = getEasyCotacaoQuantityTarget(row);
    const fracionamento = getEasyCotacaoQuantityValue(item);
    if (!target) {
      return { ok: true, changed: false, reason: 'quantity_input_not_found', fracionamento };
    }

    const current = getControlValue(target);
    if (sameEasyCotacaoQuantity(current, fracionamento)) {
      return { ok: true, changed: false, reason: 'quantity_already_filled', fracionamento };
    }

    const ok = await setPlainControlValue(target, fracionamento);
    await waitForGridRender(140);
    if (ok && meta.priceInput && !isEditableValueControl(meta.priceInput)) {
      meta.priceInput = null;
    }

    return { ok, changed: ok, reason: ok ? 'quantity_filled' : 'quantity_rejected', fracionamento };
  }

  function getEstanciaPackagePrice(item = {}, row = null) {
    const unitPrice = parsePriceNumber(item.price);
    if (unitPrice === null) return '';
    const meta = row ? (estanciaRowMeta.get(row) || parseEstanciaRowMeta(row)) : null;
    const packageQty = normalizeEstanciaPackageQty(
      item.qtdEmbalagem
      ?? item.embalagem
      ?? item.packageQty
      ?? meta?.packageQty
      ?? 1
    );
    return (unitPrice * packageQty).toFixed(2);
  }

  function sameEstanciaFixedValue(current, desired) {
    const a = parsePriceNumber(current);
    const b = parsePriceNumber(desired);
    return a !== null && b !== null && Math.abs(a - b) < 0.0001;
  }

  async function ensureEstanciaFixedFields(row) {
    const meta = estanciaRowMeta.get(row) || parseEstanciaRowMeta(row);
    if (!meta) return { ok: false, reason: 'row_meta_not_found' };
    estanciaRowMeta.set(row, meta);

    const desiredQuantity = '500';
    const desiredReference = '1';
    let quantityOk = Boolean(meta.quantityInput);
    let referenceOk = Boolean(meta.referenceInput);

    if (meta.quantityInput && !sameEstanciaFixedValue(getControlValue(meta.quantityInput), desiredQuantity)) {
      quantityOk = await setPlainControlValue(meta.quantityInput, desiredQuantity);
    }
    if (meta.referenceInput && !sameEstanciaFixedValue(getControlValue(meta.referenceInput), desiredReference)) {
      referenceOk = await setPlainControlValue(meta.referenceInput, desiredReference);
    }

    return {
      ok: quantityOk && referenceOk,
      reason: quantityOk && referenceOk ? 'fixed_fields_filled' : 'fixed_fields_rejected',
      quantityOk,
      referenceOk,
    };
  }

  async function fillEstanciaPrices() {
    const rowsByIdx = getEstanciaRows();
    const pendingByIdx = new Map();
    const pendingBySignature = new Map();
    const pendingByEan = new Map();
    for (const item of Array.isArray(prices) ? prices : []) {
      const idx = Number(item?.idx);
      if (Number.isInteger(idx) && idx >= 0) pendingByIdx.set(idx, item);
      if (item?.signature) pendingBySignature.set(String(item.signature), item);
      if (item?.ean) pendingByEan.set(String(item.ean).replace(/\D/g, ''), item);
    }

    for (let rowIndex = 0; rowIndex < rowsByIdx.length; rowIndex++) {
      const row = rowsByIdx[rowIndex];
      const meta = estanciaRowMeta.get(row) || parseEstanciaRowMeta(row);
      if (!meta) continue;
      estanciaRowMeta.set(row, meta);

      const fixedResult = await ensureEstanciaFixedFields(row);
      if (!fixedResult.ok) {
        details.push({
          idx: rowIndex,
          reason: fixedResult.reason,
          inputType: '',
          before: '',
          after: '',
          attempted: 'Qtd 500 / Ref 1',
        });
      }

      const item = pendingBySignature.get(meta.signature)
        || pendingByEan.get(meta.ean)
        || pendingByIdx.get(rowIndex);
      if (!item) continue;

      const input = meta.priceInput || getSelectedPriceInput(row, empresaColuna, site);
      if (!input) {
        failed.push(item.idx);
        details.push({ idx: item.idx, reason: 'input_not_found' });
        continue;
      }

      const packagePrice = getEstanciaPackagePrice(item, row);
      const before = getControlValue(input);
      const ok = packagePrice ? await setInputValue(input, packagePrice) : false;
      await waitForGridRender(80);
      const persisted = Boolean(ok && estanciaRowShowsPrice(row, packagePrice, samePriceLike));
      if (persisted) count++;
      else {
        failed.push(item.idx);
        details.push({
          idx: item.idx,
          reason: ok ? 'value_not_persisted' : 'value_rejected',
          inputType: input.getAttribute('type') || '',
          before,
          after: getControlValue(input),
          attempted: packagePrice || String(item.price ?? ''),
          fracionamento: String(meta.packageQty || 1),
        });
      }
    }

    for (const item of pendingByIdx.values()) {
      const idx = Number(item.idx);
      if (!Number.isInteger(idx) || idx < 0 || idx >= rowsByIdx.length) {
        failed.push(item.idx);
        details.push({ idx: item.idx, reason: 'row_not_found' });
      }
    }

    return { filled: count, failed, details, site, rowCount: rowsByIdx.length };
  }

  async function fillCotacaoWebSmusPrices() {
    const pendingByIdx = new Map();
    const pendingBySignature = new Map();

    for (const item of Array.isArray(prices) ? prices : []) {
      const idx = Number(item?.idx);
      if (Number.isInteger(idx) && idx >= 0) pendingByIdx.set(idx, item);
      if (item?.signature) pendingBySignature.set(String(item.signature), item);
    }

    let scannedRows = 0;
    await scanCotacaoWebSmusRows(async (row, idx, signature) => {
      scannedRows = Math.max(scannedRows, idx + 1);
      const item = pendingBySignature.get(signature) || pendingByIdx.get(idx);
      if (!item) return pendingByIdx.size === 0 && pendingBySignature.size === 0;

      const input = getSelectedPriceInput(row, empresaColuna, site);
      const priceCell = getCotacaoWebSmusPriceCell(row);
      const target = input || priceCell || row;
      const directTarget = input || priceCell;
      const before = input ? getControlValue(input) : '';
      let bridgeResult = await fillCotacaoWebSmusViaBridge(row, target, item);
      await waitForGridRender(80);
      let ok = false;
      let persisted = Boolean(bridgeResult?.ok && (
        cotacaoWebSmusRowShowsPrice(row, item.price)
        || bridgeResult.reason === 'angular_model_set'
      ));

      if (!persisted) {
        if (directTarget && isEditableValueControl(directTarget)) {
          ok = await setInputValue(directTarget, item.price);
          await waitForGridRender(40);
          persisted = ok && cotacaoWebSmusRowShowsPrice(row, item.price);
        } else if (directTarget && isSafeCotacaoWebSmusRawTarget(directTarget)) {
          ok = await setInputValue(directTarget, item.price);
          await waitForGridRender(40);
          persisted = ok && cotacaoWebSmusRowShowsPrice(row, item.price);
        }
      }

      if (persisted) count++;
      else {
        failed.push(item.idx);
        details.push({
          idx: item.idx,
          reason: bridgeResult?.reason || (ok ? 'value_not_persisted' : 'value_rejected'),
          inputType: input?.getAttribute?.('type') || '',
          before,
          after: input ? getControlValue(input) : '',
          cellAfter: normalizeCellText(getCotacaoWebSmusPriceCell(row)?.textContent || ''),
          bridge: bridgeResult || null,
          attempted: String(item.price ?? ''),
        });
      }

      pendingByIdx.delete(Number(item.idx));
      if (item.signature) pendingBySignature.delete(String(item.signature));
      return pendingByIdx.size === 0 && pendingBySignature.size === 0;
    }, {
      stopWhen: () => pendingByIdx.size === 0 && pendingBySignature.size === 0,
    });

    for (const item of pendingByIdx.values()) {
      failed.push(item.idx);
      details.push({ idx: item.idx, reason: 'row_not_found' });
    }

    return { filled: count, failed, details, site, rowCount: scannedRows };
  }

  if (site === 'cotacao-web-smus') {
    return fillCotacaoWebSmusPrices();
  }
  if (site === 'estancia-cotacao') {
    return fillEstanciaPrices();
  }

  const isBubbleCatalogFornecedor = site === 'bubble-catalog-fornecedor';
  const isEasyCotacaoWeb = site === 'easy-cotacao-web';

  for (const item of prices) {
    let row = rows[item.idx];
    if (isBubbleCatalogFornecedor) {
      row = findBubbleCatalogCurrentRowForItem(item, row, { requireExactEan: true });
    }

    if (!row) {
      failed.push(item.idx);
      details.push({ idx: item.idx, reason: isBubbleCatalogFornecedor ? 'ean_row_not_found' : 'row_not_found' });
      continue;
    }

    if (isBubbleCatalogFornecedor && bubbleCatalogRowShowsPrice(row, item.price, samePriceLike, item)) {
      count++;
      continue;
    }

    let input = getSelectedPriceInput(row, empresaColuna, site);

    let fractionResult = null;
    if (isBubbleCatalogFornecedor) {
      fractionResult = await ensureBubbleCatalogFraction(row, item);
      if (fractionResult.ok || !input) {
        await waitForGridRender(fractionResult.changed ? 160 : 60);
        row = findBubbleCatalogCurrentRowForItem(item, row, { requireExactEan: true });
        if (!row) {
          failed.push(item.idx);
          details.push({
            idx: item.idx,
            reason: 'ean_row_not_found_after_fraction',
            fracionamento: fractionResult.fracionamento || '',
          });
          continue;
        }
        input = getSelectedPriceInput(row, empresaColuna, site);
      }
    }
    if (isEasyCotacaoWeb) {
      fractionResult = await ensureEasyCotacaoQuantity(row, item);
      if (!fractionResult.ok) {
        failed.push(item.idx);
        details.push({
          idx: item.idx,
          reason: fractionResult.reason || 'quantity_rejected',
          fracionamento: fractionResult.fracionamento || '',
        });
        continue;
      }
      if (fractionResult.changed || !input) {
        await waitForGridRender(fractionResult.changed ? 160 : 60);
        input = getSelectedPriceInput(row, empresaColuna, site);
      }
    }

    if (!input) {
      if (isBubbleCatalogFornecedor && bubbleCatalogRowShowsPrice(row, item.price, samePriceLike, item)) {
        count++;
        continue;
      }
      failed.push(item.idx);
      details.push({
        idx: item.idx,
        reason: isBubbleCatalogFornecedor
          ? (fractionResult?.reason || 'input_not_found')
          : isEasyCotacaoWeb
            ? (fractionResult?.reason || 'input_not_found')
          : 'input_not_found',
        fracionamento: fractionResult?.fracionamento || '',
      });
      continue;
    }

    const before = getControlValue(input);
    const ok = await setInputValue(input, item.price);
    let persisted = ok;
    if (isBubbleCatalogFornecedor) {
      await waitForGridRender(140);
      row = findBubbleCatalogCurrentRowForItem(item, row, { requireExactEan: true });
      persisted = Boolean(row && bubbleCatalogRowShowsPrice(row, item.price, samePriceLike, item));
    } else if (site === 'hipcomerp-cotacao') {
      await waitForGridRender(160);
      persisted = Boolean(ok && hipcomerpRowShowsPrice(row, item.price, samePriceLike, empresaColuna));
    } else if (site === 'sg-cotacao') {
      await waitForGridRender(160);
      persisted = Boolean(ok && sgCotacaoRowShowsPrice(row, item.price, samePriceLike));
    } else if (site === 'hr-cotacao') {
      await waitForGridRender(200);
      persisted = Boolean(ok && hrCotacaoRowShowsPrice(row, item.price, samePriceLike));
    } else if (isEasyCotacaoWeb) {
      await waitForGridRender(160);
      persisted = Boolean(ok && easyCotacaoRowShowsPrice(row, item.price, samePriceLike, empresaColuna));
    }

    if (persisted) count++;
    else {
      failed.push(item.idx);
      details.push({
        idx: item.idx,
        reason: 'value_rejected',
        inputType: input.getAttribute('type') || '',
        before,
        after: getControlValue(input),
        attempted: String(item.price ?? ''),
        fracionamento: fractionResult?.fracionamento || '',
      });
    }
  }
  return { filled: count, failed, details, site, rowCount: rows.length };
}
