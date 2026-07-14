// Bridge MAIN world para o Bluesoft ERP - Portal do Fornecedor / Preencher Cotação
// (erp.bluesoft.com.br). A tela roda em AngularJS 1.x + ui-grid (virtualizado)
// DENTRO de um iframe same-origin id="corpo". Como o iframe é do mesmo domínio,
// este script roda no top frame (MAIN world) e alcança window.angular do iframe.
//
// Leitura : scope da página -> vm.gridOptions.data (itens com precoUnitario, gtins,
//           produtoKey, codigoReferencia).
// Gravação: setar item.precoUnitario e disparar
//           vm.gridApi.edit.raise.afterCellEdit(item, colDef, novo, antigo),
//           que é o mesmo caminho da edição manual e faz PUT em salvarPreco.action.
//
// Comunicação com o content.js (mundo isolado do top frame) por CustomEvent,
// igual ao hipcom-main-world.js / arius-main-world.js.
(() => {
  const BRIDGE_VERSION = '1.0.61';
  if (window.__venproBluesoftBridgeVersion === BRIDGE_VERSION) return;
  window.__venproBluesoftBridgeInstalled = true;
  window.__venproBluesoftBridgeVersion = BRIDGE_VERSION;

  const SAVE_PATH = 'salvarPreco.action';

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function getCorpoWindow() {
    try {
      const iframe = document.getElementById('corpo');
      return (iframe && iframe.contentWindow) || null;
    } catch {
      return null;
    }
  }

  // Localiza o scope do controller da página (vm com gridApi + gridOptions.data).
  function getContext() {
    const w = getCorpoWindow();
    if (!w) return null;
    const A = w.angular;
    let d;
    try {
      d = w.document;
    } catch {
      return null;
    }
    if (!A || !d) return null;
    const els = d.querySelectorAll('.ng-scope, [ng-controller], [ui-grid]');
    for (const el of els) {
      let scope;
      try {
        scope = A.element(el).scope();
      } catch {
        continue;
      }
      let s = scope;
      let hops = 0;
      while (s && hops < 12) {
        if (s.vm && s.vm.gridApi && s.vm.gridOptions && Array.isArray(s.vm.gridOptions.data)) {
          return { win: w, scope: s, vm: s.vm };
        }
        s = s.$parent;
        hops++;
      }
    }
    return null;
  }

  function bridgeReady() {
    const ctx = getContext();
    return Boolean(ctx && ctx.vm.gridOptions.data);
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

  // Um produto pode ter vários GTINs; emitimos um item por GTIN para maximizar o
  // match no backend, todos apontando para o mesmo produtoKey.
  function extract() {
    const ctx = getContext();
    if (!ctx) return { ok: false, reason: 'grid_indisponivel', items: [], recordCount: 0 };
    const data = ctx.vm.gridOptions.data;
    const items = [];
    let idx = 0;
    for (const rec of data) {
      const current_price = parsePriceNumber(rec.precoUnitario);
      const filled = current_price > 0;
      const nome = String(rec.descricao || '');
      const codigo = rec.codigoReferencia == null ? '' : String(rec.codigoReferencia);
      const eans = [...new Set((rec.gtins || []).map(g => limpaEan(g && g.gtin)).filter(Boolean))];
      if (eans.length === 0) {
        items.push({ idx: idx++, ean: '', nome, codigo, signature: '', produtoKey: rec.produtoKey, filled, current_price });
        continue;
      }
      for (const ean of eans) {
        items.push({ idx: idx++, ean, nome, codigo, signature: '', produtoKey: rec.produtoKey, filled, current_price });
      }
    }
    return { ok: true, items, recordCount: data.length };
  }

  // Observa temporariamente os XHR do iframe para confirmar quais custoFaltaKey
  // foram salvos com sucesso (o PUT salvarPreco.action responde {custoFaltaKey}).
  function installSaveWatcher(win, okKeys) {
    let X;
    try {
      X = win.XMLHttpRequest;
    } catch {
      return () => {};
    }
    if (!X || !X.prototype) return () => {};
    const originalOpen = X.prototype.open;
    const originalSend = X.prototype.send;
    X.prototype.open = function (method, url) {
      this.__venproSave = /salvarPreco\.action/i.test(String(url || ''));
      return originalOpen.apply(this, arguments);
    };
    X.prototype.send = function () {
      if (this.__venproSave) {
        this.addEventListener('load', () => {
          try {
            if (this.status >= 200 && this.status < 300) {
              const body = typeof this.response === 'string' ? this.response : this.responseText;
              const parsed = JSON.parse(body);
              if (parsed && parsed.custoFaltaKey != null) okKeys.add(String(parsed.custoFaltaKey));
            }
          } catch {}
        });
      }
      return originalSend.apply(this, arguments);
    };
    return () => {
      try {
        X.prototype.open = originalOpen;
        X.prototype.send = originalSend;
      } catch {}
    };
  }

  async function fill(prices) {
    const ctx = getContext();
    if (!ctx) return { ok: false, reason: 'grid_indisponivel', filled: 0, failed: [], details: [] };
    const { win, scope, vm } = ctx;

    let col;
    try {
      col = vm.gridApi.grid.getColumn('precoUnitario').colDef;
    } catch {
      return { ok: false, reason: 'coluna_preco_nao_encontrada', filled: 0, failed: [], details: [] };
    }

    const data = vm.gridOptions.data;
    const byKey = new Map(data.map(rec => [String(rec.produtoKey), rec]));

    const okKeys = new Set();
    const restoreWatcher = installSaveWatcher(win, okKeys);

    let filled = 0;
    const failed = [];
    const details = [];

    // Agrupa os itens por produtoKey (um produto pode aparecer em vários EANs).
    const porProduto = new Map();
    for (const item of Array.isArray(prices) ? prices : []) {
      const price = parsePriceNumber(item.price ?? item.preco ?? item.valor);
      const key = item.produtoKey;
      if (key == null || key === '') {
        failed.push(item.idx);
        details.push({ idx: item.idx, reason: 'sem_produtoKey' });
        continue;
      }
      if (price == null || price <= 0) {
        failed.push(item.idx);
        details.push({ idx: item.idx, reason: 'preco_invalido', attempted: String(item.price ?? '') });
        continue;
      }
      const rec = byKey.get(String(key));
      if (!rec) {
        failed.push(item.idx);
        details.push({ idx: item.idx, reason: 'produto_nao_encontrado' });
        continue;
      }
      if (!porProduto.has(String(key))) porProduto.set(String(key), { rec, price, idxs: [] });
      porProduto.get(String(key)).idxs.push(item.idx);
    }

    // custoFaltaKey -> idxs aguardando confirmação do PUT salvarPreco.action.
    const pending = new Map();
    try {
      for (const { rec, price, idxs } of porProduto.values()) {
        // Já está com o preço desejado: conta como preenchido sem novo PUT.
        if (parsePriceNumber(rec.precoUnitario) === price) {
          for (const idx of idxs) filled++;
          continue;
        }
        const old = rec.precoUnitario;
        rec.precoUnitario = price;
        try {
          vm.gridApi.edit.raise.afterCellEdit(rec, col, price, old);
        } catch {
          rec.precoUnitario = old;
          for (const idx of idxs) {
            failed.push(idx);
            details.push({ idx, reason: 'falha_disparo', attempted: String(price) });
          }
          continue;
        }
        const custoFaltaKey = rec.custoFaltaKey != null ? String(rec.custoFaltaKey) : null;
        if (custoFaltaKey) {
          pending.set(custoFaltaKey, idxs);
        } else {
          for (const idx of idxs) filled++; // sem chave para confirmar: otimista.
        }
        await sleep(30);
      }

      try {
        scope.$applyAsync();
      } catch {}

      // Aguarda os PUTs pendentes confirmarem (até ~15s).
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        let allDone = true;
        for (const custoFaltaKey of pending.keys()) {
          if (!okKeys.has(custoFaltaKey)) { allDone = false; break; }
        }
        if (allDone) break;
        await sleep(150);
      }
    } finally {
      restoreWatcher();
    }

    for (const [custoFaltaKey, idxs] of pending.entries()) {
      const confirmed = okKeys.has(custoFaltaKey);
      for (const idx of idxs) {
        if (confirmed) filled++;
        else {
          failed.push(idx);
          details.push({ idx, reason: 'save_nao_confirmado' });
        }
      }
    }

    return { ok: true, filled, failed, details };
  }

  function reply(requestId, payload) {
    document.dispatchEvent(new CustomEvent('venpro:bluesoft-command-result', {
      detail: { requestId, bridgeVersion: BRIDGE_VERSION, ...payload },
    }));
  }

  document.addEventListener('venpro:bluesoft-command', async event => {
    const detail = (event && event.detail) || {};
    const requestId = detail.requestId || '';
    try {
      if (detail.kind === 'state') {
        reply(requestId, { ok: bridgeReady(), ready: bridgeReady() });
        return;
      }
      if (detail.kind === 'extract') {
        reply(requestId, extract());
        return;
      }
      if (detail.kind === 'fill') {
        reply(requestId, await fill(detail.prices || []));
        return;
      }
      reply(requestId, { ok: false, reason: 'comando_desconhecido' });
    } catch (err) {
      reply(requestId, { ok: false, reason: (err && err.message) || String(err || 'bluesoft_bridge_erro') });
    }
  });

  document.dispatchEvent(new CustomEvent('venpro:bluesoft-bridge-ready', { detail: { bridgeVersion: BRIDGE_VERSION } }));
})();
