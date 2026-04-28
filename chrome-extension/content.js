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

  function limparNum(s) {
    s = (s || '').trim();
    if (/^[\d.]+[eE][+\-]?\d+$/.test(s)) {
      try { s = String(Math.round(parseFloat(s))); } catch {}
    }
    s = s.replace(/\.0+$/, '');
    return s;
  }

  function extractEAN(row) {
    for (const inp of row.querySelectorAll('input[type="hidden"]')) {
      const v = limparNum(inp.value);
      if (/^\d{7,14}$/.test(v)) return v;
    }
    const dataAttrs = ['data-ean','data-cod','data-barcode','data-codprod','data-codigo','data-id'];
    for (const attr of dataAttrs) {
      const v = limparNum(row.getAttribute(attr));
      if (/^\d{7,14}$/.test(v)) return v;
      for (const td of row.querySelectorAll('td')) {
        const v2 = limparNum(td.getAttribute(attr));
        if (/^\d{7,14}$/.test(v2)) return v2;
      }
    }
    for (const td of row.querySelectorAll('td')) {
      const txt = limparNum(td.textContent);
      if (/^\d{7,14}$/.test(txt)) return txt;
    }
    const fullText = row.textContent.trim();
    const m = fullText.match(/\b(\d{7,14})\b/);
    return m ? m[1] : null;
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

    // Extract product name
    let nome = '';
    for (const txt of cellTexts) {
      const t = txt.trim();
      if (!t) continue;
      const cleaned = t.replace(/(CX|FD)\d+R?\$?\s*$/i, '').trim();
      if (cleaned.length < 4) continue;
      if (cleaned.replace(/[.,]/g, '').replace(/^\d+$/, '')) continue;
      if (/^\d{7,14}$/.test(cleaned)) continue;
      if (/^(FD|CX|R\$|\d+\s*(UN|CX|PC|KG|G|ML|L))$/i.test(cleaned)) continue;
      if (/[A-Za-zÀ-ú]{3}/.test(cleaned)) {
        nome = cleaned;
        break;
      }
    }

    items.push({
      idx: i,
      ean: ean,
      nome: nome,
      filled: currentVal !== '',
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
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    count++;
  }
  return count;
}
