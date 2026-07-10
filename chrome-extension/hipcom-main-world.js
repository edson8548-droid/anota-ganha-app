(() => {
  const BRIDGE_VERSION = '1.0.54';
  if (window.__venproHipcomBridgeVersion === BRIDGE_VERSION) return;
  window.__venproHipcomBridgeInstalled = true;
  window.__venproHipcomBridgeVersion = BRIDGE_VERSION;

  const state = {
    baseUrl: '',
    fornecedor: '',
    loja: '',
    numeroCotacao: '',
    limit: 20,
    authHeader: '',
  };
  let fornecedorRecoveryPromise = null;
  let cotacaoRecoveryPromise = null;
  let lojaRecoveryPromise = null;

  function safeJsonParse(value) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function headersToObject(headers) {
    const out = {};
    if (!headers) return out;

    try {
      if (headers instanceof Headers) {
        headers.forEach((value, key) => { out[String(key).toLowerCase()] = String(value); });
        return out;
      }
    } catch {}

    if (Array.isArray(headers)) {
      for (const pair of headers) {
        if (Array.isArray(pair) && pair.length >= 2) out[String(pair[0]).toLowerCase()] = String(pair[1]);
      }
      return out;
    }

    if (typeof headers === 'object') {
      for (const [key, value] of Object.entries(headers)) {
        out[String(key).toLowerCase()] = String(value);
      }
    }
    return out;
  }

  function updateAuth(headers) {
    const obj = headersToObject(headers);
    const auth = obj.authorization || obj.Authorization;
    if (/^Bearer\s+/i.test(auth || '')) state.authHeader = auth;
    if (obj.fornecedor) state.fornecedor = String(obj.fornecedor);
    const loja = obj.loja || obj.numeroloja || obj['numero-loja'];
    if (loja) state.loja = String(loja);
  }

  function parseRequestBody(body) {
    if (!body || typeof body !== 'string') return null;
    return safeJsonParse(body);
  }

  function updateStateFromUrl(rawUrl, body) {
    let url;
    try {
      url = new URL(rawUrl, location.href);
    } catch {
      return { path: '', page: 0, limit: 0 };
    }

    const healthMatch = url.href.match(/^(https?:\/\/[^?#]+)\/api\/health/i);
    if (healthMatch && !state.baseUrl) state.baseUrl = `${healthMatch[1]}/api/cotweb`;

    const match = url.href.match(/^(https?:\/\/[^?#]+\/api\/cotweb)(\/[^?#]*)?/i);
    if (!match) return { path: url.pathname, page: 0, limit: 0 };

    state.baseUrl = match[1].replace(/\/$/, '');
    const path = match[2] || '';
    const fornecedor = url.searchParams.get('fornecedor');
    const loja = url.searchParams.get('loja') || url.searchParams.get('numeroLoja');
    if (fornecedor) state.fornecedor = fornecedor;
    if (loja) state.loja = loja;

    const cotacaoMatch = path.match(/\/cotacao\/(\d+)(?:\/|$)/i)
      || path.match(/\/pedido\/itens.*?[?&]numeroCotacao=(\d+)/i);
    if (cotacaoMatch) state.numeroCotacao = cotacaoMatch[1];

    const parsedBody = parseRequestBody(body);
    const page = Number.parseInt(parsedBody?.numeroPagina ?? parsedBody?.pagina ?? '0', 10);
    const limit = Number.parseInt(parsedBody?.limite || '0', 10);
    if (Number.isInteger(limit) && limit > 0 && limit <= 500) state.limit = limit;
    if (parsedBody?.numeroCotacao) state.numeroCotacao = String(parsedBody.numeroCotacao);

    return {
      path,
      page: Number.isInteger(page) && page >= 0 ? page : 0,
      limit: Number.isInteger(limit) && limit > 0 ? limit : 0,
    };
  }

  function updateStateFromLocation() {
    const route = `${location.pathname || ''}${location.search || ''}${location.hash || ''}`;
    const patterns = [
      /[?&]cotacao=(\d+)/i,
      /\/cotacoes?\/(\d+)(?:[/?#]|$)/i,
      /\/oferta\/(\d+)(?:[/?#]|$)/i,
    ];
    for (const pattern of patterns) {
      const match = route.match(pattern);
      if (match) {
        state.numeroCotacao = match[1];
        return;
      }
    }
  }

  function recoverBaseUrlFromPerformance() {
    if (state.baseUrl || !window.performance?.getEntriesByType) return;
    try {
      const entries = window.performance.getEntriesByType('resource') || [];
      for (let i = entries.length - 1; i >= 0; i--) {
        const rawUrl = entries[i]?.name || '';
        if (!rawUrl) continue;
        const cotweb = String(rawUrl).match(/^(https?:\/\/[^?#]+\/api\/cotweb)(?:\/|[?#]|$)/i);
        if (cotweb) {
          state.baseUrl = cotweb[1].replace(/\/$/, '');
          return;
        }
        const health = String(rawUrl).match(/^(https?:\/\/[^?#]+)\/api\/health/i);
        if (health) {
          state.baseUrl = `${health[1]}/api/cotweb`;
          return;
        }
      }
    } catch {}
  }

  function findBearerToken(value, depth = 0) {
    if (value == null || depth > 4) return '';
    if (typeof value === 'string') {
      const bearer = value.match(/Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/i);
      if (bearer) return bearer[1];
      const jwt = value.match(/\b(eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/);
      if (jwt) return jwt[1];
      if ((value.startsWith('{') || value.startsWith('[')) && value.length < 12000) {
        const parsed = safeJsonParse(value);
        if (parsed && parsed !== value) return findBearerToken(parsed, depth + 1);
      }
      return '';
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findBearerToken(item, depth + 1);
        if (found) return found;
      }
      return '';
    }
    if (typeof value === 'object') {
      const preferredKeys = [
        'authorization',
        'accessToken',
        'access_token',
        'token',
        'idToken',
        'jwt',
      ];
      for (const key of preferredKeys) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          const found = findBearerToken(value[key], depth + 1);
          if (found) return found;
        }
      }
      for (const item of Object.values(value)) {
        const found = findBearerToken(item, depth + 1);
        if (found) return found;
      }
    }
    return '';
  }

  function recoverAuthFromStorage() {
    if (state.authHeader) return true;
    const storages = [];
    try { if (window.localStorage) storages.push(window.localStorage); } catch {}
    try { if (window.sessionStorage) storages.push(window.sessionStorage); } catch {}
    for (const storage of storages) {
      try {
        if (!storage) continue;
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          const token = findBearerToken(storage.getItem(key));
          if (token) {
            state.authHeader = `Bearer ${token}`;
            return true;
          }
        }
      } catch {}
    }
    return Boolean(state.authHeader);
  }

  function sanitizedState() {
    updateStateFromLocation();
    return {
      bridgeVersion: BRIDGE_VERSION,
      ready: Boolean(state.baseUrl && state.fornecedor && state.loja && state.numeroCotacao && state.authHeader),
      baseCaptured: Boolean(state.baseUrl),
      fornecedor: state.fornecedor,
      loja: state.loja,
      numeroCotacao: state.numeroCotacao,
      limit: state.limit || 20,
      hasAuth: Boolean(state.authHeader),
    };
  }

  function publish(detail) {
    document.dispatchEvent(new CustomEvent('venpro:hipcom-api-captured', {
      detail: {
        ...detail,
        state: sanitizedState(),
      },
    }));
  }

  async function publishResponse(rawUrl, method, headers, body, responseText, status) {
    updateAuth(headers);
    const request = updateStateFromUrl(rawUrl, body);
    const data = safeJsonParse(responseText);
    if (!request.path || !/\/(?:cotacao|oferta|planilha)\b/i.test(request.path)) return;

    publish({
      request: {
        url: String(rawUrl),
        method: String(method || 'GET').toUpperCase(),
        path: request.path,
        page: request.page,
        limit: request.limit,
        status: Number(status || 0),
      },
      response: data,
    });
  }

  const originalFetch = window.fetch;

  function hydrateStateFromPage() {
    updateStateFromLocation();
    recoverBaseUrlFromPerformance();
    recoverAuthFromStorage();
  }

  async function recoverSingleFornecedor() {
    hydrateStateFromPage();
    if (state.fornecedor) return true;
    if (!state.baseUrl || !state.authHeader || typeof originalFetch !== 'function') return false;
    if (fornecedorRecoveryPromise) return fornecedorRecoveryPromise;

    fornecedorRecoveryPromise = (async () => {
      try {
        const response = await originalFetch(`${state.baseUrl}/user/fornecedores`, {
          method: 'GET',
          headers: {
            Authorization: state.authHeader,
            Accept: 'application/json, text/plain, */*',
          },
          credentials: 'omit',
          cache: 'no-store',
        });
        const text = await response.text();
        const data = safeJsonParse(text);
        if (response.ok && Array.isArray(data) && data.length === 1) {
          const fornecedor = data[0]?.numeroFornecedor ?? data[0]?.fornecedor ?? data[0]?.codigo ?? '';
          if (fornecedor) state.fornecedor = String(fornecedor);
        }
      } catch {}
      fornecedorRecoveryPromise = null;
      return Boolean(state.fornecedor);
    })();

    return fornecedorRecoveryPromise;
  }

  function extractLojaFromCotacao(data) {
    const candidates = [
      data?.loja?.codigo,
      data?.loja?.numeroLoja,
      data?.loja?.numero,
      data?.loja?.id,
      data?.codigoLoja,
      data?.numeroLoja,
      data?.loja,
    ];
    for (const candidate of candidates) {
      if (candidate !== undefined && candidate !== null && candidate !== '') return String(candidate);
    }
    return '';
  }

  async function recoverCotacaoDetails() {
    hydrateStateFromPage();
    if (state.loja) return true;
    if (!state.baseUrl || !state.authHeader || !state.fornecedor || !state.numeroCotacao || typeof originalFetch !== 'function') return false;
    if (cotacaoRecoveryPromise) return cotacaoRecoveryPromise;

    cotacaoRecoveryPromise = (async () => {
      try {
        const response = await originalFetch(`${state.baseUrl}/cotacao/${state.numeroCotacao}`, {
          method: 'GET',
          headers: {
            Authorization: state.authHeader,
            Accept: 'application/json, text/plain, */*',
            fornecedor: state.fornecedor,
          },
          credentials: 'omit',
          cache: 'no-store',
        });
        const text = await response.text();
        const data = safeJsonParse(text);
        if (response.ok) {
          const loja = extractLojaFromCotacao(data);
          if (loja) state.loja = loja;
        }
      } catch {}
      cotacaoRecoveryPromise = null;
      return Boolean(state.loja);
    })();

    return cotacaoRecoveryPromise;
  }

  async function recoverLojaByProbe() {
    hydrateStateFromPage();
    if (state.loja) return true;
    if (!state.baseUrl || !state.authHeader || !state.fornecedor || !state.numeroCotacao || typeof originalFetch !== 'function') return false;
    if (lojaRecoveryPromise) return lojaRecoveryPromise;

    lojaRecoveryPromise = (async () => {
      const candidates = [];
      for (let loja = 1; loja <= 20; loja++) candidates.push(String(loja));
      try {
        for (const loja of candidates) {
          const response = await originalFetch(`${state.baseUrl}/cotacao/${state.numeroCotacao}/itens`, {
            method: 'POST',
            headers: {
              Authorization: state.authHeader,
              Accept: 'application/json, text/plain, */*',
              'Content-Type': 'application/json;charset=UTF-8',
              fornecedor: state.fornecedor,
              loja,
            },
            body: JSON.stringify({ numeroPagina: 0, pesquisa: '', limite: 1 }),
            credentials: 'omit',
            cache: 'no-store',
          });
          const text = await response.text();
          const data = safeJsonParse(text);
          if (response.ok && Array.isArray(data?.itens) && data.itens.length > 0) {
            state.loja = loja;
            break;
          }
        }
      } catch {}
      lojaRecoveryPromise = null;
      return Boolean(state.loja);
    })();

    return lojaRecoveryPromise;
  }

  if (typeof originalFetch === 'function') {
    window.fetch = async function venproHipcomFetch(input, init = {}) {
      const rawUrl = typeof input === 'string' ? input : input?.url;
      const method = init?.method || input?.method || 'GET';
      const headers = init?.headers || input?.headers;
      const body = init?.body;
      updateAuth(headers);
      updateStateFromUrl(rawUrl, body);

      const response = await originalFetch.apply(this, arguments);
      try {
        const clone = response.clone();
        const text = await clone.text();
        await publishResponse(rawUrl, method, headers, body, text, response.status);
      } catch {}
      return response;
    };
  }

  const OriginalXHR = window.XMLHttpRequest;
  if (typeof OriginalXHR === 'function') {
    const originalOpen = OriginalXHR.prototype.open;
    const originalSend = OriginalXHR.prototype.send;
    const originalSetRequestHeader = OriginalXHR.prototype.setRequestHeader;

    OriginalXHR.prototype.open = function venproHipcomOpen(method, url) {
      this.__venproHipcom = { method, url, headers: {}, body: null };
      return originalOpen.apply(this, arguments);
    };

    OriginalXHR.prototype.setRequestHeader = function venproHipcomSetHeader(name, value) {
      if (this.__venproHipcom) this.__venproHipcom.headers[String(name).toLowerCase()] = String(value);
      return originalSetRequestHeader.apply(this, arguments);
    };

    OriginalXHR.prototype.send = function venproHipcomSend(body) {
      if (this.__venproHipcom) {
        this.__venproHipcom.body = body;
        updateAuth(this.__venproHipcom.headers);
        updateStateFromUrl(this.__venproHipcom.url, body);
      }

      this.addEventListener('load', () => {
        const meta = this.__venproHipcom || {};
        let text = '';
        try {
          if (!this.responseType || this.responseType === 'text' || this.responseType === 'json') {
            text = typeof this.response === 'string' ? this.response : this.responseText;
          }
        } catch {}
        publishResponse(meta.url, meta.method, meta.headers, meta.body, text, this.status);
      });

      return originalSend.apply(this, arguments);
    };
  }

  async function runApiCommand(detail) {
    const requestId = detail?.requestId || '';
    const reply = payload => {
      document.dispatchEvent(new CustomEvent('venpro:hipcom-api-command-result', {
        detail: { requestId, bridgeVersion: BRIDGE_VERSION, ...payload, state: sanitizedState() },
      }));
    };

    try {
      if (detail?.kind === 'state') {
        hydrateStateFromPage();
        await recoverSingleFornecedor();
        await recoverCotacaoDetails();
        await recoverLojaByProbe();
        reply({ ok: true, status: 200, data: null });
        return;
      }

      hydrateStateFromPage();
      await recoverSingleFornecedor();
      await recoverCotacaoDetails();
      await recoverLojaByProbe();
      if (!state.baseUrl || !state.authHeader) {
        reply({ ok: false, reason: 'api_context_incomplete' });
        return;
      }

      const path = String(detail?.path || '').startsWith('/') ? String(detail.path) : `/${detail?.path || ''}`;
      const url = new URL(`${state.baseUrl}${path}`);
      const commandQuery = detail?.query || {};
      const fornecedor = commandQuery.fornecedor ?? state.fornecedor;
      const loja = commandQuery.loja ?? commandQuery.numeroLoja ?? state.loja;
      for (const [key, value] of Object.entries(commandQuery)) {
        if (/^(fornecedor|loja|numeroLoja)$/i.test(key)) continue;
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
      }

      const method = String(detail?.method || 'GET').toUpperCase();
      const headers = {
        Authorization: state.authHeader,
        Accept: 'application/json, text/plain, */*',
      };
      if (fornecedor !== undefined && fornecedor !== null && fornecedor !== '') headers.fornecedor = String(fornecedor);
      if (loja !== undefined && loja !== null && loja !== '') headers.loja = String(loja);
      const options = {
        method,
        headers,
        credentials: 'omit',
        cache: 'no-store',
      };
      if (method !== 'GET') {
        headers['Content-Type'] = 'application/json;charset=UTF-8';
        options.body = JSON.stringify(detail?.body ?? {});
      }

      const response = await originalFetch(url.href, options);
      const text = await response.text();
      const data = safeJsonParse(text);
      publishResponse(url.href, method, headers, options.body, text, response.status);
      reply({ ok: response.ok, status: response.status, data, text: data == null ? text.slice(0, 500) : '' });
    } catch (err) {
      reply({ ok: false, reason: err?.message || String(err || 'hipcom_api_failed') });
    }
  }

  document.addEventListener('venpro:hipcom-api-command', event => {
    runApiCommand(event.detail || {});
  });

  publish({ request: { path: 'bridge_ready', method: 'INIT', status: 0 }, response: null });
})();
