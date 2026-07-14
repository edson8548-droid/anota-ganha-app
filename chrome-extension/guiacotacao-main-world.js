// Bridge MAIN world para o "Cotação Web" da Guia Sistemas (Precificar do
// fornecedor). Ex.: cg.jrsupermercados.com.br/Fornecedores/Precificar?cotacaoId=N
//
// A tela usa um Syncfusion ej2 Grid (id="Grid") com dataSource client-side de
// TODOS os itens (paginação é local) e edição em lote (mode "Batch"). O grid e
// o jQuery vivem no contexto da página, então este script roda no MAIN world.
//
// Leitura : document.querySelector('.e-grid').ej2_instances[0].dataSource
//           (itens com CodBarras=EAN, ProdutoId, PrecoUnitario, QtdPorEmbalagem,
//            QtdEmbalagem, PrecoEmbalagem, PrecoFinal, ...).
// Gravação: setar PrecoUnitario e recalcular PrecoEmbalagem/PrecoFinal como o
//           próprio grid faz, e enviar TODO o array via PUT Fornecedores/putCotacao
//           (mesmo request do botão "Gravar Dados"); resposta {status:"sucesso"}.
//
// Conversa com o content.js (mundo isolado do top frame) por CustomEvent, igual
// aos demais bridges (hipcom/arius/bluesoft).
(() => {
  const BRIDGE_VERSION = '1.0.60';
  if (window.__venproGuiaBridgeVersion === BRIDGE_VERSION) return;
  window.__venproGuiaBridgeInstalled = true;
  window.__venproGuiaBridgeVersion = BRIDGE_VERSION;

  const SAVE_URL = 'putCotacao';

  function getGrid() {
    try {
      const el = document.querySelector('.e-grid');
      return (el && el.ej2_instances && el.ej2_instances[0]) || null;
    } catch {
      return null;
    }
  }

  function getData(grid) {
    if (!grid) return [];
    let ds = grid.dataSource;
    if (ds && !Array.isArray(ds) && Array.isArray(ds.json)) ds = ds.json;
    return Array.isArray(ds) ? ds : [];
  }

  function bridgeReady() {
    return getData(getGrid()).length > 0;
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

  function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  function cleanRow(row) {
    const out = {};
    for (const key of Object.keys(row)) {
      if (key.startsWith('_') || key.startsWith('$')) continue;
      out[key] = row[key];
    }
    return out;
  }

  function extract() {
    const grid = getGrid();
    const data = getData(grid);
    if (!data.length) return { ok: false, reason: 'grid_indisponivel', items: [], recordCount: 0 };
    const items = [];
    let idx = 0;
    for (const rec of data) {
      const filled = parsePriceNumber(rec.PrecoUnitario) > 0;
      const nome = String(rec.Descricao || '');
      const codigo = rec.CodReferencia == null ? '' : String(rec.CodReferencia);
      const ean = limpaEan(rec.CodBarras);
      items.push({ idx: idx++, ean, nome, codigo, signature: '', produtoId: rec.ProdutoId, filled });
    }
    return { ok: true, items, recordCount: data.length };
  }

  function putCotacao(cleanArray) {
    return new Promise(resolve => {
      try {
        window.jQuery.ajax({
          url: SAVE_URL,
          type: 'PUT',
          contentType: 'application/json',
          data: JSON.stringify(cleanArray),
          success: d => resolve({ ok: true, data: d }),
          error: x => resolve({ ok: false, status: x && x.status }),
        });
      } catch (err) {
        resolve({ ok: false, reason: (err && err.message) || String(err) });
      }
    });
  }

  async function fill(prices) {
    const grid = getGrid();
    const data = getData(grid);
    if (!data.length) return { ok: false, reason: 'grid_indisponivel', filled: 0, failed: [], details: [] };

    const byId = new Map(data.map(rec => [String(rec.ProdutoId), rec]));
    const applied = []; // idxs que tiveram preço aplicado no dataSource
    const failed = [];
    const details = [];
    const doneByProduto = new Set();

    for (const item of Array.isArray(prices) ? prices : []) {
      const price = parsePriceNumber(item.price ?? item.preco ?? item.valor);
      const id = item.produtoId;

      if (id == null || id === '') {
        failed.push(item.idx);
        details.push({ idx: item.idx, reason: 'sem_produtoId' });
        continue;
      }
      if (price == null || price <= 0) {
        failed.push(item.idx);
        details.push({ idx: item.idx, reason: 'preco_invalido', attempted: String(item.price ?? '') });
        continue;
      }
      const rec = byId.get(String(id));
      if (!rec) {
        failed.push(item.idx);
        details.push({ idx: item.idx, reason: 'produto_nao_encontrado' });
        continue;
      }

      if (!doneByProduto.has(String(id))) {
        const qtdPorEmb = Number(rec.QtdPorEmbalagem) || 1;
        const qtdEmb = Number(rec.QtdEmbalagem) || 1;
        rec.PrecoUnitario = price;
        rec.PrecoEmbalagem = round2(price * qtdPorEmb);
        rec.PrecoFinal = round2(rec.PrecoEmbalagem * qtdEmb);
        doneByProduto.add(String(id));
      }
      applied.push(item.idx);
    }

    if (applied.length === 0) {
      return { ok: true, filled: 0, failed, details };
    }

    // Atualiza a exibição do grid e grava tudo de uma vez (mesmo PUT do botão
    // "Gravar Dados").
    try {
      if (grid.refresh) grid.refresh();
    } catch {}

    const cleanArray = data.map(cleanRow);
    const result = await putCotacao(cleanArray);
    const sucesso = Boolean(result.ok && (!result.data || String(result.data.status || 'sucesso').toLowerCase() === 'sucesso'));

    if (sucesso) {
      return { ok: true, filled: applied.length, failed, details };
    }
    for (const idx of applied) {
      failed.push(idx);
      details.push({ idx, reason: 'falha_gravar', status: result.status });
    }
    return { ok: true, filled: 0, failed, details };
  }

  function reply(requestId, payload) {
    document.dispatchEvent(new CustomEvent('venpro:guia-command-result', {
      detail: { requestId, bridgeVersion: BRIDGE_VERSION, ...payload },
    }));
  }

  document.addEventListener('venpro:guia-command', async event => {
    const detail = (event && event.detail) || {};
    const requestId = detail.requestId || '';
    try {
      if (detail.kind === 'state') {
        reply(requestId, { ok: bridgeReady(), ready: bridgeReady(), recordCount: getData(getGrid()).length });
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
      reply(requestId, { ok: false, reason: (err && err.message) || String(err || 'guia_bridge_erro') });
    }
  });

  document.dispatchEvent(new CustomEvent('venpro:guia-bridge-ready', { detail: { bridgeVersion: BRIDGE_VERSION } }));
})();
