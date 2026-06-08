// Content script — runs on supported quotation pages.

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
  const inputs = getEditableInputs(root);
  const editable = Array.from(root.querySelectorAll('[contenteditable="true"], [role="textbox"]'))
    .filter(el => isVisible(el));
  return [...inputs, ...editable].filter((el, index, all) => all.indexOf(el) === index);
}

function isPriceLikeInput(input) {
  const meta = `${input.name || ''} ${input.id || ''} ${input.className || ''} ${input.placeholder || ''}`.toLowerCase();
  return /(preco|preço|valor|vlr|cotacao|cotação|unit)/.test(meta);
}

function normalizeCellText(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
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
  for (const td of row.querySelectorAll('td')) {
    const txt = limparEAN(td.textContent);
    if (txt) return txt;
  }
  const fullText = row.textContent.trim();
  const m = fullText.match(/\d{8,14}/);
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
  const cells = getDirectCells(row);
  const priceColumnIndex = findColumnIndexByHeader(
    row,
    [/pre[çc]o\s*un\b/i, /pre[çc]o\s+unit/i, /^\s*pre[çc]o\s*$/i],
    [/total|frete|embalagem|quantidade|tamanho/i]
  );

  if (priceColumnIndex >= 0) {
    const priceCell = cells[priceColumnIndex];
    const controls = getEditableControls(priceCell || row);
    if (controls.length) return controls;
    if (priceCell && isVisible(priceCell)) return [priceCell];
  }

  const controls = getEditableControls(row).filter(input => {
    const meta = `${input.name || ''} ${input.id || ''} ${input.className || ''} ${input.placeholder || ''} ${input.getAttribute('aria-label') || ''}`.toLowerCase();
    const cellText = normalizeCellText(input.closest('td, th')?.textContent || '');
    return !/codigo|c[oó]d|ean|produto|nome|quant|qtd|embalagem|tamanho|frete|data/.test(`${meta} ${cellText}`);
  });
  const priceLike = controls.filter(isPriceLikeInput);
  return priceLike.length ? priceLike : controls;
}

function getPriceCandidates(row, site = 'generic') {
  if (site === 'rede-fornecedores') return getRedeFornecedoresPriceCandidates(row);
  if (site === 'intersolid-cotacao') return getIntersolidPriceCandidates(row);
  if (site === 'cotacao-web-smus') return getCotacaoWebSmusPriceCandidates(row);
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
    return Array.from(document.querySelectorAll('tr')).filter(row => {
      const text = row.textContent || '';
      return getPriceCandidates(row, site).length > 0 && /\d{8,14}/.test(text) && /[A-Za-zÀ-ú]{3}/.test(text);
    });
  }

  return Array.from(document.querySelectorAll('tr')).filter(row => getEditableInputs(row).length > 0);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForGridRender() {
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await sleep(20);
}

function dispatchScrollEvent(el) {
  try {
    el.dispatchEvent(new Event('scroll', { bubbles: true }));
  } catch {}
}

function isScrollableY(el) {
  if (!el || el === document || el === window) return false;
  const style = window.getComputedStyle(el);
  const overflowY = `${style.overflowY || ''} ${style.overflow || ''}`;
  return /(auto|scroll|overlay)/i.test(overflowY)
    && el.scrollHeight > el.clientHeight + 20
    && el.getBoundingClientRect().height > 80;
}

function getCotacaoWebSmusVisibleRows() {
  return Array.from(document.querySelectorAll('tr')).filter(row => {
    const text = row.textContent || '';
    return getPriceCandidates(row, 'cotacao-web-smus').length > 0
      && /\d{8,14}/.test(text)
      && /[A-Za-zÀ-ú]{3}/.test(text);
  });
}

function getCotacaoWebSmusScroller() {
  const rows = getCotacaoWebSmusVisibleRows();
  const candidates = new Map();

  function addCandidate(el) {
    if (!el || el === document.body || el === document.documentElement) return;
    if (!isScrollableY(el)) return;
    const rowsInside = rows.filter(row => el.contains(row)).length;
    if (!rowsInside) return;
    const rect = el.getBoundingClientRect();
    const score = rowsInside * 1000
      + Math.min(el.scrollHeight - el.clientHeight, 20000) / 10
      + Math.min(rect.height, 600);
    candidates.set(el, Math.max(candidates.get(el) || 0, score));
  }

  for (const row of rows) {
    let parent = row.parentElement;
    while (parent && parent !== document.body) {
      addCandidate(parent);
      parent = parent.parentElement;
    }
  }

  for (const el of document.querySelectorAll('div, section, main, article, tbody')) {
    addCandidate(el);
  }

  const ranked = Array.from(candidates.entries()).sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0] || null;
}

async function scanCotacaoWebSmusRows(onRow, options = {}) {
  const scroller = getCotacaoWebSmusScroller();
  const restoreScroll = options.restoreScroll !== false;
  const stopWhen = typeof options.stopWhen === 'function' ? options.stopWhen : null;
  const originalTop = scroller ? scroller.scrollTop : 0;
  const seen = new Map();

  async function visitVisibleRows() {
    const rows = getCotacaoWebSmusVisibleRows();
    for (const row of rows) {
      const signature = getCotacaoWebSmusRowSignature(row);
      if (!signature || seen.has(signature)) continue;
      const idx = seen.size;
      seen.set(signature, idx);
      const shouldStop = await onRow(row, idx, signature, scroller ? scroller.scrollTop : 0);
      if (shouldStop) return true;
    }
    return false;
  }

  if (!scroller) {
    await visitVisibleRows();
    return seen.size;
  }

  scroller.scrollTop = 0;
  dispatchScrollEvent(scroller);
  await waitForGridRender();

  let unchangedAtBottom = 0;
  let lastSeenSize = 0;
  const maxIterations = 2500;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    if (await visitVisibleRows()) break;
    if (stopWhen && stopWhen()) break;

    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const atBottom = scroller.scrollTop >= maxTop - 2;
    if (atBottom) {
      if (seen.size === lastSeenSize) unchangedAtBottom++;
      else unchangedAtBottom = 0;
      if (unchangedAtBottom >= 2) break;
    }

    lastSeenSize = seen.size;
    const step = Math.max(120, Math.floor((scroller.clientHeight || 240) * 0.75));
    const nextTop = Math.min(maxTop, scroller.scrollTop + step);
    if (Math.abs(nextTop - scroller.scrollTop) < 1) break;

    scroller.scrollTop = nextTop;
    dispatchScrollEvent(scroller);
    await waitForGridRender();
  }

  await visitVisibleRows();

  if (restoreScroll) {
    scroller.scrollTop = originalTop;
    dispatchScrollEvent(scroller);
  }

  return seen.size;
}

function extractItemFromRow(row, idx, site, empresaColuna) {
  const priceInput = site === 'vr-cotacao'
    ? getEditableInputs(row)[0]
    : getSelectedPriceInput(row, empresaColuna, site);
  if (!priceInput) return null;

  const ean = extractEANFromRow(row, site);
  const nome = extractProductNameFromRow(row);

  return {
    idx,
    ean,
    nome,
    codigo: site === 'cotacao-web-smus' ? getCotacaoWebSmusCodigo(row) : '',
    signature: site === 'cotacao-web-smus' ? getCotacaoWebSmusRowSignature(row) : '',
    filled: isFilledPriceValue(getControlValue(priceInput).trim()),
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
  if (site === 'cotacao-web-smus') {
    return extractCotacaoWebSmusItems(options);
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

  function activateNestedEditor(input) {
    if (!input || 'value' in input || input.isContentEditable || input.getAttribute('role') === 'textbox') {
      return null;
    }

    try {
      input.click();
      input.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
    } catch {}

    const nested = getEditableControls(input)[0];
    if (nested) return nested;

    const active = document.activeElement;
    if (active && active !== input && input.contains(active)) {
      if ('value' in active || active.isContentEditable || active.getAttribute('role') === 'textbox') {
        return active;
      }
    }
    return null;
  }

  function setInputValue(input, value) {
    input.scrollIntoView({ block: 'center', inline: 'nearest' });
    const nestedEditor = activateNestedEditor(input);
    if (nestedEditor) return setInputValue(nestedEditor, value);

    input.focus?.();

    for (const candidate of priceValueCandidates(value, input)) {
      try {
        input.focus?.();
        if (typeof input.select === 'function') input.select();
        writeNativeValue(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        writeNativeValue(input, candidate);
        dispatchInputEvents(input, candidate);
        if (hasPrice(getControlValue(input))) return true;
      } catch {}
    }

    const fallback = priceValueCandidates(value, input)[0];
    if (!fallback) return false;

    try {
      input.focus?.();
      if (typeof input.select === 'function') input.select();
      document.execCommand?.('insertText', false, fallback);
      dispatchInputEvents(input, fallback);
    } catch {}

    return hasPrice(getControlValue(input));
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
    await scanCotacaoWebSmusRows((row, idx, signature) => {
      scannedRows = Math.max(scannedRows, idx + 1);
      const item = pendingByIdx.get(idx) || pendingBySignature.get(signature);
      if (!item) return pendingByIdx.size === 0 && pendingBySignature.size === 0;

      const input = getSelectedPriceInput(row, empresaColuna, site);
      if (!input) {
        failed.push(item.idx);
        details.push({ idx: item.idx, reason: 'input_not_found' });
        pendingByIdx.delete(Number(item.idx));
        if (item.signature) pendingBySignature.delete(String(item.signature));
        return pendingByIdx.size === 0 && pendingBySignature.size === 0;
      }

      const before = getControlValue(input);
      const ok = setInputValue(input, item.price);
      if (ok) count++;
      else {
        failed.push(item.idx);
        details.push({
          idx: item.idx,
          reason: 'value_rejected',
          inputType: input.getAttribute('type') || '',
          before,
          after: getControlValue(input),
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

  for (const item of prices) {
    const row = rows[item.idx];
    if (!row) {
      failed.push(item.idx);
      details.push({ idx: item.idx, reason: 'row_not_found' });
      continue;
    }
    const input = site === 'vr-cotacao'
      ? getEditableInputs(row)[0]
      : getSelectedPriceInput(row, empresaColuna, site);
    if (!input) {
      failed.push(item.idx);
      details.push({ idx: item.idx, reason: 'input_not_found' });
      continue;
    }

    const before = getControlValue(input);
    const ok = setInputValue(input, item.price);
    if (ok) count++;
    else {
      failed.push(item.idx);
      details.push({
        idx: item.idx,
        reason: 'value_rejected',
        inputType: input.getAttribute('type') || '',
        before,
        after: getControlValue(input),
        attempted: String(item.price ?? ''),
      });
    }
  }
  return { filled: count, failed, details, site, rowCount: rows.length };
}
