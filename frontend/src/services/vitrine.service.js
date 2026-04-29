import axios from 'axios';
import { auth } from '../firebase/config';

const API_URL = 'https://api.venpro.com.br';

async function getHeaders() {
  const token = await auth.currentUser?.getIdToken();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function getMultipartHeaders() {
  const token = await auth.currentUser?.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export const vitrineService = {
  // ── Ofertas ──────────────────────────────────────
  async listar() {
    const headers = await getHeaders();
    return axios.get(`${API_URL}/api/vitrine/ofertas`, { headers });
  },

  async criar(data) {
    const headers = await getHeaders();
    return axios.post(`${API_URL}/api/vitrine/ofertas`, data, { headers });
  },

  async obter(id) {
    const headers = await getHeaders();
    return axios.get(`${API_URL}/api/vitrine/ofertas/${id}`, { headers });
  },

  async atualizar(id, data) {
    const headers = await getHeaders();
    return axios.put(`${API_URL}/api/vitrine/ofertas/${id}`, data, { headers });
  },

  async excluir(id) {
    const headers = await getHeaders();
    return axios.delete(`${API_URL}/api/vitrine/ofertas/${id}`, { headers });
  },

  // ── Itens ─────────────────────────────────────────
  async adicionarItem(offerId, item) {
    const headers = await getHeaders();
    return axios.post(`${API_URL}/api/vitrine/ofertas/${offerId}/items`, item, { headers });
  },

  async atualizarItem(offerId, itemId, data) {
    const headers = await getHeaders();
    return axios.put(`${API_URL}/api/vitrine/ofertas/${offerId}/items/${itemId}`, data, { headers });
  },

  async removerItem(offerId, itemId) {
    const headers = await getHeaders();
    return axios.delete(`${API_URL}/api/vitrine/ofertas/${offerId}/items/${itemId}`, { headers });
  },

  // ── Parse de lista ───────────────────────────────
  async parseLista(lista) {
    const headers = await getHeaders();
    return axios.post(`${API_URL}/api/vitrine/parse-lista`, { lista }, { headers });
  },

  // ── Imagens ──────────────────────────────────────
  async uploadImagem(offerId, itemId, file) {
    const headers = await getMultipartHeaders();
    const form = new FormData();
    form.append('arquivo', file);
    return axios.post(`${API_URL}/api/vitrine/ofertas/${offerId}/items/${itemId}/imagem`, form, { headers });
  },

  async uploadLogo(offerId, file) {
    const headers = await getMultipartHeaders();
    const form = new FormData();
    form.append('arquivo', file);
    return axios.post(`${API_URL}/api/vitrine/ofertas/${offerId}/logo`, form, { headers });
  },

  async sugerirImagem(productName) {
    const headers = await getHeaders();
    return axios.get(`${API_URL}/api/vitrine/sugerir-imagem`, {
      headers,
      params: { product_name: productName },
    });
  },

  // ── Página pública (sem auth) ─────────────────────
  async obterPublica(slug) {
    return axios.get(`${API_URL}/api/vitrine/publica/${slug}`);
  },

  // ── Helpers ──────────────────────────────────────
  gerarLinkPublico(slug) {
    return `${window.location.origin}/oferta/${slug}`;
  },

  imagemUrl(path) {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${API_URL}${path}`;
  },
};
