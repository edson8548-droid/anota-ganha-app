(function initVenproMultiTable(globalScope) {
  function normalizeJobTableSelections(job = {}) {
    const configured = Array.isArray(job.tabelas) ? job.tabelas : [];
    const selections = configured
      .map(item => ({
        tabelaId: String(item?.tabelaId || item?.id || '').trim(),
        prazo: Number(item?.prazo || 0),
        nome: String(item?.nome || '').trim(),
      }))
      .filter(item => item.tabelaId);

    if (selections.length) return selections;

    const tabelaId = String(job.tabelaId || '').trim();
    return tabelaId ? [{
      tabelaId,
      prazo: Number(job.prazo || 0),
      nome: String(job.tabelaNome || '').trim(),
    }] : [];
  }

  function parsePrice(value) {
    const normalized = String(value ?? '')
      .replace(/[^\d,.-]/g, '')
      .replace(/\.(?=\d{3}(?:\D|$))/g, '')
      .replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function mergeTableMatchResponses(responses = [], batchTotal = 0) {
    const bestByIdx = new Map();
    const maintained = new Set();
    const diagnostics = [];

    for (const response of responses) {
      const selection = response?.selection || {};
      const data = response?.data || {};
      const tableLabel = selection.nome || selection.tabelaId || 'Tabela';

      for (const price of Array.isArray(data.precos) ? data.precos : []) {
        const idx = Number(price?.idx);
        const numericPrice = parsePrice(price?.price);
        if (!Number.isFinite(idx) || numericPrice == null) continue;

        const current = bestByIdx.get(idx);
        if (!current || numericPrice < current.numericPrice) {
          bestByIdx.set(idx, {
            numericPrice,
            value: {
              ...price,
              tabela_id: selection.tabelaId || '',
              tabela_nome: selection.nome || '',
              prazo: Number(selection.prazo || 0),
            },
          });
        }
      }

      for (const idxValue of Array.isArray(data.mantidos) ? data.mantidos : []) {
        const idx = Number(idxValue);
        if (Number.isFinite(idx)) maintained.add(idx);
      }

      for (const line of Array.isArray(data.diagnostics) ? data.diagnostics : []) {
        if (diagnostics.length >= 20) break;
        diagnostics.push(`tabela=${tableLabel}|${line}`);
      }
    }

    const precos = [...bestByIdx.values()]
      .map(item => item.value)
      .sort((a, b) => Number(a.idx) - Number(b.idx));
    const pricedIdx = new Set(precos.map(item => Number(item.idx)));
    const mantidos = [...maintained]
      .filter(idx => !pricedIdx.has(idx))
      .sort((a, b) => a - b);
    const total = Math.max(0, Number(batchTotal) || 0);
    const naoEncontrados = Math.max(0, total - precos.length - mantidos.length);

    return {
      precos,
      mantidos,
      diagnostics,
      stats: {
        preenchidos: precos.length,
        total,
        nao_encontrados: naoEncontrados,
        mantidos_menor_preco: mantidos.length,
      },
      tabelas_comparadas: responses.length,
    };
  }

  globalScope.VenproMultiTable = {
    mergeTableMatchResponses,
    normalizeJobTableSelections,
    parsePrice,
  };
})(globalThis);
