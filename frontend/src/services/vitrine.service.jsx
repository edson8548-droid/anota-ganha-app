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
    throw new Error('A API não confirmou a exclusão. Atualize a página e tente novamente.');
  }
}

async function excluirViaSimpleFallback(id, url, headers) {
  const token = String(headers.Authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Sessão expirada. Faça login novamente.');
  const tokenParam = encodeURIComponent(token);

  try {
    const response = await fetch(`${url}/excluir-simple`, {
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

  await fetch(`${url}/excluir-simple`, {
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

  await loadImage(`${apiUrl('/users/vitrine-delete-link')}?offer_id=${encodeURIComponent(id)}&token=${tokenParam}&t=${Date.now()}`);
  await wait(1500);
  try {
    await confirmarExclusao(id, headers);
    return { data: { ok: true, fallback: 'users-image-verified' } };
  } catch {
    // Keep the older vitrine image fallback as a final compatibility path.
  }

  await loadImage(`${url}/excluir-link?token=${tokenParam}&t=${Date.now()}`);
  await wait(1500);
  await confirmarExclusao(id, headers);
  return { data: { ok: true, fallback: 'image-verified' } };
}

function slugifyPathSegment(value, fallback = 'empresa') {
  const slug = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return slug || fallback;
}

export const vitrineService = {
  // ── Ofertas ──────────────────────────────────────
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
    return axios.get(apiUrl(`/vitrine/ofertas/${id}`), { headers });
  },

  async atualizar(id, data) {
    const headers = await getHeaders();
    return axios.put(apiUrl(`/vitrine/ofertas/${id}`), data, { headers });
  },

  async excluir(id) {
    const headers = await getHeaders();
    const url = apiUrl(`/vitrine/ofertas/${id}`);
    let lastErr = null;
    try {
      return await axios.post(apiUrl('/users/vitrine-status'), { offer_id: id, status: 'removed' }, { headers });
    } catch (err) {
      lastErr = err;
      if (!shouldTryDeleteFallback(err)) throw err;
    }

    try {
      return await axios.post(apiUrl('/users/vitrine-delete'), { offer_id: id }, { headers });
    } catch (err) {
      lastErr = err;
      if (!shouldTryDeleteFallback(err)) throw err;
    }

    try {
      return await axios.post(`${url}/excluir`, {}, { headers });
    } catch (err) {
      lastErr = err;
      if (!shouldTryDeleteFallback(err)) throw err;
    }

    try {
      return await axios.put(url, { status: 'deleted' }, { headers });
    } catch (err) {
      lastErr = err;
      if (!shouldTryDeleteFallback(err)) throw err;
    }

    try {
      return await axios.delete(url, { headers });
    } catch (err) {
      lastErr = err;
      if (!isNetworkError(err)) throw err;
    }

    return excluirViaSimpleFallback(id, url, headers);
  },

  // ── Itens ─────────────────────────────────────────
  async adicionarItem(offerId, item) {
    const headers = await getHeaders();
    return axios.post(apiUrl(`/vitrine/ofertas/${offerId}/items`), item, { headers });
  },

  async atualizarItem(offerId, itemId, data) {
    const headers = await getHeaders();
    return axios.put(apiUrl(`/vitrine/ofertas/${offerId}/items/${itemId}`), data, { headers });
  },

  async removerItem(offerId, itemId) {
    const headers = await getHeaders();
    return axios.delete(apiUrl(`/vitrine/ofertas/${offerId}/items/${itemId}`), { headers });
  },

  async substituirItens(offerId, items) {
    const headers = await getHeaders();
    return axios.put(apiUrl(`/vitrine/ofertas/${offerId}/items`), { items }, { headers });
  },

  // ── Parse de lista ───────────────────────────────
  async parseLista(lista) {
    const headers = await getHeaders();
    return axios.post(apiUrl('/vitrine/parse-lista'), { lista }, { headers });
  },

  // ── Imagens ──────────────────────────────────────
  async uploadImagem(offerId, itemId, file) {
    const headers = await getMultipartHeaders();
    const form = new FormData();
    form.append('arquivo', file);
    return axios.post(apiUrl(`/vitrine/ofertas/${offerId}/items/${itemId}/imagem`), form, { headers });
  },

  async uploadLogo(offerId, file) {
    const headers = await getMultipartHeaders();
    const form = new FormData();
    form.append('arquivo', file);
    return axios.post(apiUrl(`/vitrine/ofertas/${offerId}/logo`), form, { headers });
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

  async aprenderImagem(productName, imageUrl, ean = null) {
    const headers = await getHeaders();
    return axios.post(apiUrl('/vitrine/aprender-imagem'), {
      product_name: productName,
      image_url: imageUrl,
      ean,
      source: 'manual_select',
    }, { headers });
  },

  // ── Página pública (sem auth) ─────────────────────
  async obterPublica(slug) {
    return axios.get(apiUrl(`/vitrine/publica/${slug}`));
  },

  // ── Helpers ──────────────────────────────────────
  gerarEmpresaSlug(companyName) {
    return slugifyPathSegment(companyName);
  },

  gerarLinkPublico(slug, companyName) {
    if (companyName) {
      return `${window.location.origin}/${slugifyPathSegment(companyName)}/ofertas/${slug}`;
    }
    return `${window.location.origin}/oferta/${slug}`;
  },

  imagemUrl(path) {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    if (!BACKEND_URL) return path;
    return backendUrl(path);
  },
};
