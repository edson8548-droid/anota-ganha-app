// Content script — runs on supported quotation pages.

const cotacaoWebSmusPriceCellMeta = new WeakMap();
const bubbleCatalogRowMeta = new WeakMap();

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

function getPriceCandidates(row, site = 'generic') {
  if (site === 'rede-fornecedores') return getRedeFornecedoresPriceCandidates(row);
  if (site === 'intersolid-cotacao') return getIntersolidPriceCandidates(row);
  if (site === 'cotacao-web-smus') return getCotacaoWebSmusPriceCandidates(row);
  if (site === 'bubble-catalog-fornecedor') return getBubbleCatalogPriceCandidates(row);
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
    };
  }

  const priceInput = site === 'vr-cotacao'
    ? getEditableInputs(row)[0]
    : getSelectedPriceInput(row, empresaColuna, site);
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

  async function setInputValue(input, value) {
    input.scrollIntoView({ block: 'center', inline: 'nearest' });

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

  function sameBubbleCatalogFraction(current, desired) {
    const a = parsePriceNumber(current);
    const b = parsePriceNumber(desired);
    return a !== null && b !== null && Math.abs(a - b) < 0.0001;
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

  const isBubbleCatalogFornecedor = site === 'bubble-catalog-fornecedor';

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

    let input = site === 'vr-cotacao'
      ? getEditableInputs(row)[0]
      : getSelectedPriceInput(row, empresaColuna, site);

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
