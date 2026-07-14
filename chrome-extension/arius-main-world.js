// Bridge MAIN world para o Arius ERP / Cotação (SmartClient / Isomorphic).
// A UI é renderizada por widgets isc.* (canvas), sem inputs no DOM: o grid de
// produtos é o global `listProdutos` e as chamadas ao servidor passam por
// `request(tipo, metodo, data, cb, cbErro)`. Um content script no mundo isolado
// não enxerga esses globais, então este script roda no MAIN world e responde a
// comandos via CustomEvent (mesmo padrão do hipcom-main-world.js):
//   content.js  --('venpro:arius-command')-->  este bridge
//   este bridge --('venpro:arius-command-result')-->  content.js
(() => {
  const BRIDGE_VERSION = '1.0.58';
  if (window.__venproAriusBridgeVersion === BRIDGE_VERSION) return;
  window.__venproAriusBridgeInstalled = true;
  window.__venproAriusBridgeVersion = BRIDGE_VERSION;

  function grid() {
    try {
      return (typeof window.listProdutos !== 'undefined' && window.listProdutos) || null;
    } catch {
      return null;
    }
  }

  function bridgeReady() {
    return Boolean(grid() && typeof window.request === 'function' && typeof window.isc !== 'undefined');
  }

  function getRecords() {
    const g = grid();
    if (!g) return [];
    let data;
    try {
      data = g.getData ? g.getData() : g.data;
    } catch {
      return [];
    }
    if (!data) return [];
    if (typeof data.getLength === 'function') {
      const arr = [];
      const len = data.getLength();
      for (let i = 0; i < len; i++) arr.push(data.get(i));
      return arr;
    }
    return Array.isArray(data) ? data : [];
  }

  function findRow(idProduto) {
    const g = grid();
    if (!g) return { rowNum: -1, rec: null };
    let data;
    try {
      data = g.getData();
    } catch {
      return { rowNum: -1, rec: null };
    }
    const len = data && data.getLength ? data.getLength() : 0;
    for (let i = 0; i < len; i++) {
      const rec = data.get(i);
      if (rec && String(rec.idProduto) === String(idProduto)) return { rowNum: i, rec };
    }
    return { rowNum: -1, rec: null };
  }

  function buscaEans(idProduto) {
    return new Promise(resolve => {
      try {
        window.request('GET', 'Cotacao/buscaEans', { idProduto },
          ret => resolve(Array.isArray(ret) ? ret : []),
          () => resolve([]));
      } catch {
        resolve([]);
      }
    });
  }

  function salvaCotacaoValores(record) {
    return new Promise(resolve => {
      try {
        window.request('POST', 'Cotacao/salvaCotacaoValores', record,
          ret => resolve({ ok: true, ret }),
          err => resolve({ ok: false, err }));
      } catch (err) {
        resolve({ ok: false, err });
      }
    });
  }

  async function mapLimit(arr, limit, fn) {
    const out = new Array(arr.length);
    let cursor = 0;
    async function worker() {
      while (cursor < arr.length) {
        const idx = cursor++;
        out[idx] = await fn(arr[idx], idx);
      }
    }
    const workers = Array.from({ length: Math.max(1, Math.min(limit, arr.length)) }, worker);
    await Promise.all(workers);
    return out;
  }

  function limpaEan(value) {
    return String(value == null ? '' : value).replace(/\D/g, '');
  }

  function parsePriceNumber(value) {
    let normalized = String(value == null ? '' : value).replace(/[^\d,.-]/g, '');
    if (normalized.includes(',') && normalized.includes('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else if (normalized.includes(',')) {
      normalized = normalized.replace(',', '.');
    }
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }

  function cleanRecord(rec) {
    const clean = {};
    for (const key of Object.keys(rec)) {
      if (/^_|^\$/.test(key)) continue;
      clean[key] = rec[key];
    }
    return clean;
  }

  // Um produto pode ter vários EANs (unidade, caixa/DUN-14). Emitimos um item por
  // EAN para maximizar o match no backend; todos apontam para o mesmo idProduto.
  async function extract() {
    const records = getRecords();
    const eansPerRecord = await mapLimit(records, 6, rec => buscaEans(rec.idProduto));
    const items = [];
    let idx = 0;
    records.forEach((rec, i) => {
      const filled = parsePriceNumber(rec.custo) > 0;
      const nome = String(rec.descricaoProduto || '');
      const codigo = rec.referencia == null ? '' : String(rec.referencia);
      const eans = [...new Set((eansPerRecord[i] || []).map(e => limpaEan(e && e.idEan)).filter(Boolean))];
      if (eans.length === 0) {
        items.push({ idx: idx++, ean: '', nome, codigo, signature: '', idProduto: rec.idProduto, filled });
        return;
      }
      for (const ean of eans) {
        items.push({ idx: idx++, ean, nome, codigo, signature: '', idProduto: rec.idProduto, filled });
      }
    });
    return { ok: true, items, recordCount: records.length };
  }

  async function fill(prices) {
    const g = grid();
    if (!g) return { ok: false, reason: 'grid_indisponivel', filled: 0, failed: [], details: [] };

    let filled = 0;
    const failed = [];
    const details = [];
    const doneByProduto = new Set();

    for (const item of Array.isArray(prices) ? prices : []) {
      const price = parsePriceNumber(item.price ?? item.preco ?? item.valor);
      const idProduto = item.idProduto;

      if (idProduto == null || idProduto === '') {
        failed.push(item.idx);
        details.push({ idx: item.idx, reason: 'sem_idProduto' });
        continue;
      }
      if (price == null || price <= 0) {
        failed.push(item.idx);
        details.push({ idx: item.idx, reason: 'preco_invalido', attempted: String(item.price ?? '') });
        continue;
      }
      // Mesmo produto já preenchido por outro EAN nesta rodada.
      if (doneByProduto.has(String(idProduto))) {
        filled++;
        continue;
      }

      const { rowNum, rec } = findRow(idProduto);
      if (!rec) {
        failed.push(item.idx);
        details.push({ idx: item.idx, reason: 'produto_nao_encontrado' });
        continue;
      }

      const payload = cleanRecord(rec);
      payload.custo = price;
      const result = await salvaCotacaoValores(payload);
      if (result.ok) {
        try {
          rec.custo = price;
          if (g.refreshRow) g.refreshRow(rowNum);
          if (g.markForRedraw) g.markForRedraw();
        } catch {}
        doneByProduto.add(String(idProduto));
        filled++;
      } else {
        failed.push(item.idx);
        details.push({ idx: item.idx, reason: 'falha_salvar', attempted: String(price) });
      }
    }

    return { ok: true, filled, failed, details };
  }

  function reply(requestId, payload) {
    document.dispatchEvent(new CustomEvent('venpro:arius-command-result', {
      detail: { requestId, bridgeVersion: BRIDGE_VERSION, ...payload },
    }));
  }

  document.addEventListener('venpro:arius-command', async event => {
    const detail = (event && event.detail) || {};
    const requestId = detail.requestId || '';
    try {
      if (detail.kind === 'state') {
        reply(requestId, { ok: bridgeReady(), ready: bridgeReady(), recordCount: getRecords().length });
        return;
      }
      if (detail.kind === 'extract') {
        reply(requestId, await extract());
        return;
      }
      if (detail.kind === 'fill') {
        reply(requestId, await fill(detail.prices || []));
        return;
      }
      reply(requestId, { ok: false, reason: 'comando_desconhecido' });
    } catch (err) {
      reply(requestId, { ok: false, reason: (err && err.message) || String(err || 'arius_bridge_erro') });
    }
  });

  document.dispatchEvent(new CustomEvent('venpro:arius-bridge-ready', { detail: { bridgeVersion: BRIDGE_VERSION } }));
})();
