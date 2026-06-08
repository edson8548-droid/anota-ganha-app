(function () {
  if (window.__venproSmusPageBridge) {
    document.documentElement.setAttribute('data-venpro-smus-bridge', 'ready');
    return;
  }
  window.__venproSmusPageBridge = true;
  document.documentElement.setAttribute('data-venpro-smus-bridge', 'ready');

  const REQUEST_EVENT = 'venpro-smus-fill-request';
  const RESULT_EVENT = 'venpro-smus-fill-result';

  function sendResult(payload) {
    document.dispatchEvent(new CustomEvent(RESULT_EVENT, {
      detail: JSON.stringify(payload || {}),
    }));
  }

  function parseDetail(detail) {
    if (!detail) return {};
    if (typeof detail === 'string') {
      try { return JSON.parse(detail); } catch { return {}; }
    }
    return detail || {};
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();
  }

  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function comparableDigits(value) {
    const raw = String(value ?? '').trim();
    const direct = onlyDigits(raw);
    if (/^\d{8,14}$/.test(direct)) return direct;
    if (/^[+-]?\d+(\.\d+)?([eE][+\-]?\d+)?$/.test(raw.replace(',', '.'))) {
      const parsed = Number(raw.replace(',', '.'));
      if (Number.isFinite(parsed)) {
        const expanded = String(Math.trunc(parsed));
        if (/^\d{8,14}$/.test(expanded)) return expanded;
      }
    }
    return direct;
  }

  function parsePrice(value) {
    let raw = String(value ?? '').replace(/[^\d,.-]/g, '').trim();
    if (!raw) return null;
    if (raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./g, '').replace(',', '.');
    else if (raw.includes(',')) raw = raw.replace(',', '.');
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function isObject(value) {
    return Boolean(value) && typeof value === 'object';
  }

  function isUnsafeObject(value) {
    return !isObject(value)
      || value === window
      || value === document
      || value.nodeType
      || value instanceof Element
      || value instanceof EventTarget;
  }

  function ownKeys(obj) {
    try {
      return Object.keys(obj).filter(key => key && key[0] !== '$');
    } catch {
      return [];
    }
  }

  function addScope(scopes, scope) {
    if (!scope || scopes.includes(scope)) return;
    scopes.push(scope);
    let parent = scope.$parent;
    let depth = 0;
    while (parent && !scopes.includes(parent) && depth < 10) {
      scopes.push(parent);
      parent = parent.$parent;
      depth++;
    }
  }

  function addScopeTree(scopes, rootScope, maxScopes = 5000) {
    if (!rootScope) return;
    const queue = [rootScope];
    const seen = new Set();

    while (queue.length && scopes.length < maxScopes) {
      const scope = queue.shift();
      if (!scope || seen.has(scope)) continue;
      seen.add(scope);
      addScope(scopes, scope);

      let child;
      try { child = scope.$$childHead; } catch { child = null; }
      let guard = 0;
      while (child && guard < maxScopes) {
        if (!seen.has(child)) queue.push(child);
        try { child = child.$$nextSibling; } catch { child = null; }
        guard++;
      }
    }
  }

  function addInjectorScope(scopes, angularRef, el) {
    try {
      const injector = angularRef.element(el).injector?.();
      const rootScope = injector?.get?.('$rootScope');
      addScopeTree(scopes, rootScope);
    } catch {}
  }

  function collectAngularScopes(rowToken, cellToken) {
    const scopes = [];
    const angularRef = window.angular;
    if (!angularRef?.element) return scopes;

    const row = document.querySelector(`[data-venpro-smus-row="${rowToken}"]`);
    const cell = document.querySelector(`[data-venpro-smus-cell="${cellToken}"]`);
    const elements = [cell, row];

    let parent = row?.parentElement;
    let depth = 0;
    while (parent && parent !== document.body && depth < 8) {
      elements.push(parent);
      parent = parent.parentElement;
      depth++;
    }
    elements.push(document.body);

    for (const el of elements.filter(Boolean)) {
      try { addScope(scopes, angularRef.element(el).scope()); } catch {}
      try { addScope(scopes, angularRef.element(el).isolateScope()); } catch {}
      addInjectorScope(scopes, angularRef, el);
    }

    return scopes;
  }

  function collectObjects(root, out, seen, depth, maxObjects) {
    if (out.length >= maxObjects || depth < 0 || isUnsafeObject(root) || seen.has(root)) return;
    seen.add(root);

    if (!root.$eval && !root.$watch && !root.$$watchers) out.push(root);

    if (Array.isArray(root)) {
      for (let i = 0; i < root.length && out.length < maxObjects; i++) {
        const value = root[i];
        if (isObject(value)) collectObjects(value, out, seen, depth - 1, maxObjects);
      }
      return;
    }

    for (const key of ownKeys(root)) {
      if (/^(constructor|prototype|__proto__|window|document|location)$/i.test(key)) continue;
      let value;
      try { value = root[key]; } catch { continue; }
      if (typeof value === 'function') continue;
      if (isObject(value)) collectObjects(value, out, seen, depth - 1, maxObjects);
    }
  }

  function hasNameMatch(value, requestedName) {
    const text = normalizeText(value);
    const requested = normalizeText(requestedName);
    if (!requested || !text) return false;
    if (text.includes(requested) || requested.includes(text)) return true;

    const tokens = requested.split(' ').filter(token => token.length >= 3).slice(0, 5);
    if (tokens.length < 2) return false;
    return tokens.filter(token => text.includes(token)).length >= Math.min(3, tokens.length);
  }

  function objectScore(obj, req) {
    let score = 0;
    for (const key of ownKeys(obj)) {
      let value;
      try { value = obj[key]; } catch { continue; }
      if (isObject(value) || typeof value === 'function') continue;

      const keyNorm = normalizeText(key);
      const digits = comparableDigits(value);
      if (req.ean && digits === req.ean) score += 320;
      if (req.codigo && /COD|CODIGO|ID|PROD/.test(keyNorm) && digits === req.codigo) score += 220;
      if (req.codigo && digits === req.codigo && String(req.codigo).length >= 4) score += 70;
      if (req.nome && typeof value === 'string' && hasNameMatch(value, req.nome)) score += 90;
    }
    return score;
  }

  function priceKeyScore(key) {
    const text = normalizeText(key);
    if (!/(PRECO|PREÇO|VALOR|VLR|VL|PRICE|UNITARIO|UNITARIA|COTAC|OFERTA)/.test(text)) return 0;
    if (/(TOTAL|FRETE|DESCONTO|ACRESC|QUANT|QTD|EMBAL|TAMANHO|CUSTO|CODIGO|COD|EAN|BARRAS|PRODUTO|NOME|DESC|DATA)/.test(text)) return 0;
    let score = 10;
    if (/(UN|UNIT|UNITARIO|UNITARIA)/.test(text)) score += 30;
    if (/(FORNEC|COTAC|OFERTA)/.test(text)) score += 20;
    if (/^(PRECO|PREÇO|VALOR|VLR|VL)$/.test(text)) score += 15;
    if (/^(PRECOUN|PRECOUNITARIO|PREÇOUNITARIO|VALORUN|VALORUNITARIO|VLUN|VLUNITARIO|VLRUN|VLRUNITARIO)$/.test(text)) score += 25;
    return score;
  }

  function findPriceKeys(obj) {
    return ownKeys(obj)
      .map(key => ({ key, score: priceKeyScore(key) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.key);
  }

  function collectPriceTargets(root, out, seen, depth, baseScore) {
    if (depth < 0 || isUnsafeObject(root) || seen.has(root)) return;
    seen.add(root);

    const priceKeys = findPriceKeys(root);
    if (priceKeys.length) {
      const keyScore = priceKeys.reduce((sum, key) => sum + priceKeyScore(key), 0);
      out.push({ obj: root, priceKeys, score: baseScore + keyScore });
    }

    if (Array.isArray(root)) {
      for (let i = 0; i < root.length; i++) {
        if (isObject(root[i])) collectPriceTargets(root[i], out, seen, depth - 1, baseScore - 4);
      }
      return;
    }

    for (const key of ownKeys(root)) {
      if (/^(constructor|prototype|__proto__|window|document|location)$/i.test(key)) continue;
      let value;
      try { value = root[key]; } catch { continue; }
      if (typeof value === 'function') continue;
      if (isObject(value)) collectPriceTargets(value, out, seen, depth - 1, baseScore - 4);
    }
  }

  function setPriceValue(obj, key, price) {
    let oldValue;
    try { oldValue = obj[key]; } catch {}
    if (typeof oldValue === 'string' || oldValue == null) obj[key] = price.toFixed(2).replace('.', ',');
    else obj[key] = price;
  }

  function digest(scopes) {
    for (const scope of scopes) {
      try {
        if (typeof scope.$applyAsync === 'function') {
          scope.$applyAsync();
          return;
        }
      } catch {}
    }

    for (const scope of scopes) {
      try {
        const root = scope.$root || scope;
        if (typeof root.$digest === 'function' && !root.$$phase) {
          root.$digest();
          return;
        }
      } catch {}
    }
  }

  function fillAngularModel(req) {
    const price = parsePrice(req.price);
    if (!price) return { ok: false, reason: 'invalid_price' };

    const scopes = collectAngularScopes(req.rowToken, req.cellToken);
    if (!scopes.length) return { ok: false, reason: 'angular_scope_not_found' };

    const objects = [];
    const seen = new WeakSet();
    for (const scope of scopes) collectObjects(scope, objects, seen, 5, 30000);

    const candidates = [];
    for (const obj of objects) {
      const score = objectScore(obj, req);
      if (score < 160) continue;
      collectPriceTargets(obj, candidates, new WeakSet(), 4, score);
    }
    candidates.sort((a, b) => b.score - a.score || b.priceKeys.length - a.priceKeys.length);

    const best = candidates[0];
    if (!best) return { ok: false, reason: 'angular_row_not_found', objects: objects.length };

    const keys = best.priceKeys.slice(0, 4);
    for (const key of keys) setPriceValue(best.obj, key, price);
    digest(scopes);

    return { ok: true, reason: 'angular_model_set', keys, score: best.score, objects: objects.length };
  }

  document.addEventListener(REQUEST_EVENT, event => {
    const req = parseDetail(event.detail);
    let result;
    try {
      result = fillAngularModel(req);
    } catch (err) {
      result = { ok: false, reason: 'bridge_error', message: err?.message || String(err || 'erro') };
    }
    sendResult({ requestId: req.requestId, ...result });
  });

  sendResult({ requestId: 'ready', ok: true, reason: 'bridge_ready' });
})();
