// Content script — runs on cotatudo.com.br pages

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'extractItems') {
    const items = extractCotatudoItems();
    sendResponse({ items });
  } else if (msg.action === 'fillPrices') {
    const count = fillCotatudoPrices(msg.prices);
    sendResponse({ filled: count });
  }
  return true; // keep channel open for async
});

function extractCotatudoItems() {
  const rows = document.querySelectorAll('table#conteudo_gvItem tbody tr');
  const items = [];

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

  function extractEAN(row) {
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

  function isFilledPrice(value) {
    const raw = String(value || '').trim();
    if (!raw) return false;
    const normalized = raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    const n = Number(normalized);
    return Number.isFinite(n) && n > 0;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const inputs = row.querySelectorAll('input[type="text"], input[type="number"]');
    if (inputs.length === 0) continue;
    const lastInput = inputs[inputs.length - 1];
    const currentVal = (lastInput.value || '').trim();

    const cells = row.querySelectorAll('td');
    const cellTexts = [];
    for (const td of cells) {
      cellTexts.push(td.textContent.trim());
    }
    const ean = extractEAN(row);

    // Extract product name — pick first cell with at least 3 letters
    let nome = '';
    for (const txt of cellTexts) {
      const t = txt.trim();
      if (t.length < 4) continue;
      if (limparEAN(t)) continue;                                       // EAN
      if (/^[\d.,\s]+$/.test(t)) continue;                             // pure number/price
      if (/^(FD|CX|R\$|\d+\s*(UN|CX|PC|KG|G|ML|L))$/i.test(t)) continue; // packaging
      if (/[A-Za-zÀ-ú]{3}/.test(t)) {
        nome = t.replace(/(CX|FD)\d+R?\$?\s*$/i, '').trim();
        break;
      }
    }

    items.push({
      idx: i,
      ean: ean,
      nome: nome,
      filled: isFilledPrice(currentVal),
    });
  }
  return items;
}

function fillCotatudoPrices(prices) {
  const rows = document.querySelectorAll('table#conteudo_gvItem tbody tr');
  let count = 0;

  for (const item of prices) {
    const row = rows[item.idx];
    if (!row) continue;
    const inputs = row.querySelectorAll('input[type="text"], input[type="number"]');
    if (inputs.length === 0) continue;
    const input = inputs[inputs.length - 1];

    // Set value and trigger change event for ASP.NET
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    nativeInputValueSetter.call(input, item.price);
    input.dispatchEvent(new Event('input',  { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur',   { bubbles: true }));
    count++;
  }
  return count;
}
