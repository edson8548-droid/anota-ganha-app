import axios from 'axios';
import { auth } from '../firebase/config';
import { BACKEND_URL, apiUrl, backendUrl } from '../config/api';

async function getHeaders() {
  if (!auth.currentUser && typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
  }
  if (!auth.currentUser) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  const token = await auth.currentUser.getIdToken();
  const headers = { 'Content-Type': 'application/json' };
  headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function getMultipartHeaders() {
  if (!auth.currentUser && typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
  }
  if (!auth.currentUser) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  const token = await auth.currentUser.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

function shouldTryDeleteFallback(err) {
  const status = err?.response?.status;
  return (
    !err?.response ||
    status === 405 ||
    status === 408 ||
    status === 429 ||
    status >= 500
  );
}

function isNetworkError(err) {
  return !err?.response && err?.message === 'Network Error';
}

function isFetchNetworkError(err) {
  return err instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(err?.message || '');
}

async function readFetchError(response) {
  try {
    const data = await response.json();
    return data?.detail || data?.message;
  } catch {
    try {
      return await response.text();
    } catch {
      return null;
    }
  }
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Acorda o servidor caso esteja hibernado (Render free tier / cold start).
// Tenta pingar /health ate o servidor responder ou o tempo esgotar.
async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function ensureServerAwake(maxWaitMs = 60000) {
  const checkUrl = (BACKEND_URL || '') + '/health';
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetchWithTimeout(checkUrl, {
        method: 'GET',
        mode: 'cors',
      });
      if (res.ok) return;
    } catch {
      // servidor ainda acordando
    }
    await wait(2000);
  }
}

async function loadImage(url, timeoutMs = 3000) {
  await new Promise(resolve => {
    const img = new Image();
    const done = () => resolve();
    const timer = setTimeout(done, timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      done();
    };
    img.onerror = () => {
      clearTimeout(timer);
      done();
    };
    img.referrerPolicy = 'no-referrer';
    img.src = url;
  });
}

async function confirmarExclusao(id, headers) {
  const res = await axios.get(apiUrl('/vitrine/ofertas'), { headers });
  const aindaExiste = (res.data || []).some(oferta =>
    oferta._id === id && oferta.status !== 'deleted'
  );
  if (aindaExiste) {
    throw new Error('Servidor indisponivel no momento. Aguarde alguns segundos e tente excluir novamente.');
  }
}

async function excluirViaSimpleFallback(id, url, headers) {
  const token = String(headers.Authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Sessao expirada. Faca login novamente.');
  const tokenParam = encodeURIComponent(token);
  const nextUrl = encodeURIComponent((window.location?.origin || 'https://venpro.com.br') + '/vitrine?fix=redirect13');
  const neutralSimpleUrl = (
    apiUrl('/users/resource-state-simple')
    + '?resource=catalog&resource_id=' + encodeURIComponent(id)
    + '&state=removed'
  );

  try {
    const response = await fetch(neutralSimpleUrl, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain' },
      body: token,
    });
    if (!response.ok) {
      throw new Error(await readFetchError(response) || 'Erro ao excluir');
    }
    return { data: await response.json().catch(() => ({ ok: true, fallback: 'neutral-simple' })) };
  } catch (err) {
    if (!isFetchNetworkError(err)) throw err;
  }

  await fetch(neutralSimpleUrl, {
    method: 'POST',
    mode: 'no-cors',
    body: new URLSearchParams({ token }),
  });
  await wait(1500);
  try {
    await confirmarExclusao(id, headers);
    return { data: { ok: true, fallback: 'neutral-simple-verified' } };
  } catch {
    // Continue with compatibility fallbacks below.
  }

  try {
    const response = await fetch(url + '/excluir-simple', {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain' },
      body: token,
    });
    if (!response.ok) {
      throw new Error(await readFetchError(response) || 'Erro ao excluir');
    }
    return { data: await response.json().catch(() => ({ ok: true, fallback: 'simple' })) };
  } catch (err) {
    if (!isFetchNetworkError(err)) throw err;
  }

  await fetch(url + '/excluir-simple', {
    method: 'POST',
    mode: 'no-cors',
    body: new URLSearchParams({ token }),
  });
  await wait(1200);
  try {
    await confirmarExclusao(id, headers);
    return { data: { ok: true, fallback: 'simple-verified' } };
  } catch {
    // Last-resort path for browsers/networks that block cross-origin POST/PUT/DELETE.
  }

  await loadImage(
    apiUrl('/users/resource-state-link')
    + '?resource=catalog&resource_id=' + encodeURIComponent(id)
    + '&state=removed&token=' + tokenParam
    + '&t=' + Date.now()
  );
  await wait(1500);
  try {
    await confirmarExclusao(id, headers);
    return { data: { ok: true, fallback: 'resource-image-verified' } };
  } catch {
    // Keep the older image fallbacks for compatibility with already deployed APIs.
  }

  await loadImage(apiUrl('/users/vitrine-delete-link') + '?offer_id=' + encodeURIComponent(id) + '&token=' + tokenParam + '&t=' + Date.now());
  await wait(1500);
  try {
    await confirmarExclusao(id, headers);
    return { data: { ok: true, fallback: 'users-image-verified' } };
  } catch {
    // Keep the older vitrine image fallback as a final compatibility path.
  }

  await loadImage(url + '/excluir-link?token=' + tokenParam + '&t=' + Date.now());
  await wait(1500);
  try {
    await confirmarExclusao(id, headers);
    return { data: { ok: true, fallback: 'image-verified' } };
  } catch {
    const redirectUrl = (
      apiUrl('/users/resource-state-redirect')
      + '?resource=catalog&resource_id=' + encodeURIComponent(id)
      + '&state=removed&token=' + tokenParam
      + '&next=' + nextUrl
      + '&t=' + Date.now()
    );
    window.location.assign(redirectUrl);
    return { data: { ok: true, fallback: 'redirect' } };
  }
}

function slugifyPathSegment(value, fallback) {
  var fb = fallback || 'empresa';
  const slug = String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fb;
}

export const vitrineService = {
  // Ofertas
  async listar() {
    const headers = await getHeaders();
    return axios.get(apiUrl('/vitrine/ofertas'), { headers });
  },

  async criar(data) {
    const headers = await getHeaders();
    return axios.post(apiUrl('/vitrine/ofertas'), data, { headers });
  },

  async obter(id) {
    const headers = await getHeaders();
    return axios.get(apiUrl('/vitrine/ofertas/' + id), { headers });
  },

  async atualizar(id, data) {
    const headers = await getHeaders();
    return axios.put(apiUrl('/vitrine/ofertas/' + id), data, { headers });
  },

  async excluir(id, options) {
    const onAguardandoServidor = (options || {}).onAguardandoServidor;
    const url = apiUrl('/vitrine/ofertas/' + id);

    // Executa a cadeia completa de metodos de exclusao.
    // Retorna o resultado se algum metodo funcionar.
    // Lanca imediatamente se o erro for definitivo (4xx exceto 405/408/429).
    // Retorna { networkError: true } se todos falharam por falta de conexao (cold start).
    const tentarCadeia = async () => {
      const hdrs = await getHeaders();
      let todosNetworkError = true;

      const tryMethod = async (fn) => {
        try {
          return { ok: await fn(hdrs) };
        } catch (err) {
          if (!shouldTryDeleteFallback(err)) throw err;
          if (err && err.response) todosNetworkError = false;
          return null;
        }
      };

      let r;

      r = await tryMethod(function(h) {
        return axios.post(apiUrl('/users/resource-state'), {
          resource: 'catalog',
          resource_id: id,
          state: 'removed',
        }, { headers: h });
      });
      if (r) return r.ok;

      r = await tryMethod(function(h) {
        return axios.post(apiUrl('/users/vitrine-status'), { offer_id: id, status: 'removed' }, { headers: h });
      });
      if (r) return r.ok;

      r = await tryMethod(function(h) {
        return axios.post(apiUrl('/users/vitrine-delete'), { offer_id: id }, { headers: h });
      });
      if (r) return r.ok;

      r = await tryMethod(function(h) {
        return axios.post(url + '/excluir', {}, { headers: h });
      });
      if (r) return r.ok;

      r = await tryMethod(function(h) {
        return axios.put(url, { status: 'deleted' }, { headers: h });
      });
      if (r) return r.ok;

      r = await tryMethod(function(h) {
        return axios.delete(url, { headers: h });
      });
      if (r) return r.ok;

      return { networkError: todosNetworkError };
    };

    // Primeira tentativa
    const primeira = await tentarCadeia();
    if (!primeira || !primeira.networkError) return primeira;

    // Todos os erros foram de rede: servidor provavelmente hibernado (cold start).
    // Acorda o servidor e tenta novamente antes de cair no fallback de imagem.
    if (typeof onAguardandoServidor === 'function') onAguardandoServidor();
    await ensureServerAwake();

    const segunda = await tentarCadeia();
    if (!segunda || !segunda.networkError) return segunda;

    // Ultimo recurso: fallbacks via imagem
    const hdrs = await getHeaders();
    return excluirViaSimpleFallback(id, url, hdrs);
  },

  // Itens
  async adicionarItem(offerId, item) {
    const headers = await getHeaders();
    return axios.post(apiUrl('/vitrine/ofertas/' + offerId + '/items'), item, { headers });
  },

  async atualizarItem(offerId, itemId, data) {
    const headers = await getHeaders();
    return axios.put(apiUrl('/vitrine/ofertas/' + offerId + '/items/' + itemId), data, { headers });
  },

  async removerItem(offerId, itemId) {
    const headers = await getHeaders();
    return axios.delete(apiUrl('/vitrine/ofertas/' + offerId + '/items/' + itemId), { headers });
  },

  async substituirItens(offerId, items) {
    const headers = await getHeaders();
    return axios.put(apiUrl('/vitrine/ofertas/' + offerId + '/items'), { items }, { headers });
  },

  // Parse de lista
  async parseLista(lista) {
    const headers = await getHeaders();
    return axios.post(apiUrl('/vitrine/parse-lista'), { lista }, { headers });
  },

  // Imagens
  async uploadImagem(offerId, itemId, file) {
    const headers = await getMultipartHeaders();
    const form = new FormData();
    form.append('arquivo', file);
    return axios.post(apiUrl('/vitrine/ofertas/' + offerId + '/items/' + itemId + '/imagem'), form, { headers });
  },

  async uploadLogo(offerId, file) {
    const headers = await getMultipartHeaders();
    const form = new FormData();
    form.append('arquivo', file);
    return axios.post(apiUrl('/vitrine/ofertas/' + offerId + '/logo'), form, { headers });
  },

  async sugerirImagem(productName) {
    const headers = await getHeaders();
    return axios.get(apiUrl('/vitrine/sugerir-imagem'), {
      headers,
      params: { product_name: productName },
    });
  },

  async sugerirImagens(productName) {
    const headers = await getHeaders();
    return axios.get(apiUrl('/vitrine/sugerir-imagens'), {
      headers,
      params: { product_name: productName },
    });
  },

  async aprenderImagem(productName, imageUrl, ean) {
    const headers = await getHeaders();
    return axios.post(apiUrl('/vitrine/aprender-imagem'), {
      product_name: productName,
      image_url: imageUrl,
      ean: ean || null,
      source: 'manual_select',
    }, { headers });
  },

  // Pagina publica (sem auth)
  async obterPublica(slug) {
    return axios.get(apiUrl('/vitrine/publica/' + slug));
  },

  // Helpers
  gerarEmpresaSlug(companyName) {
    return slugifyPathSegment(companyName);
  },

  gerarLinkPublico(slug, companyName) {
    if (companyName) {
      return window.location.origin + '/' + slugifyPathSegment(companyName) + '/ofertas/' + slug;
    }
    return window.location.origin + '/oferta/' + slug;
  },

  imagemUrl(path) {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    if (!BACKEND_URL) return path;
    return backendUrl(path);
  },
};
