import axios from 'axios';
import { auth } from '../firebase/config';
import { BACKEND_URL, apiUrl, backendUrl } from '../config/api';

async function getHeaders() {
  const token = await auth.currentUser?.getIdToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function getMultipartHeaders() {
  const token = await auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
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
    return axios.delete(apiUrl(`/vitrine/ofertas/${id}`), { headers });
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
