import api from './api';
import { auth } from '../firebase/config';

export const listarTabelas = () => api.get('/cotacao/tabelas');

export const uploadTabela = (arquivo, nome, prazo = 28) => {
  const formData = new FormData();
  formData.append('arquivo', arquivo);
  formData.append('nome', nome);
  formData.append('prazo', prazo);
  return api.post('/cotacao/tabelas', formData);
};

export const renomearTabela = (id, nome) => {
  const formData = new FormData();
  formData.append('nome', nome);
  return api.put(`/cotacao/tabelas/${id}`, formData);
};

export const excluirTabela = (id) => api.delete(`/cotacao/tabelas/${id}`);

export const processarCotacao = async (arquivo, tabelaId, modo = 'completo') => {
  const formData = new FormData();
  formData.append('arquivo', arquivo);
  formData.append('tabela_id', tabelaId);
  formData.append('modo', modo);

  const response = await api.post('/cotacao/processar', formData, {
    responseType: 'blob',
  });

  // Extrair stats do header
  const statsHeader = response.headers['x-stats'];
  const semMatchHeader = response.headers['x-sem-match'];
  const stats = statsHeader ? JSON.parse(statsHeader) : {};
  const semMatch = semMatchHeader ? JSON.parse(semMatchHeader) : [];

  return { blob: response.data, stats, semMatch };
};

export const gerarTabelaPrazos = async (arquivo, percentuais) => {
  const formData = new FormData();
  formData.append('arquivo', arquivo);
  formData.append('pct_7',  parseFloat(percentuais[7])  || 0);
  formData.append('pct_14', parseFloat(percentuais[14]) || 0);
  formData.append('pct_21', parseFloat(percentuais[21]) || 0);
  formData.append('pct_28', parseFloat(percentuais[28]) || 0);

  const user = auth.currentUser;
  if (!user) throw new Error('Faça login novamente.');
  const token = await user.getIdToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 150000);

  let response;
  try {
    response = await fetch('https://api.venpro.com.br/api/cotacao/gerar-tabela-prazos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Tempo esgotado (2,5 min). PDFs muito grandes: converta para Excel antes de enviar.');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.detail || `Erro ${response.status}`);
  }

  return response.blob();
};

export const previewCotacao = async (arquivo, tabelaId, modo = 'completo') => {
  const formData = new FormData();
  formData.append('arquivo', arquivo);
  formData.append('tabela_id', tabelaId);
  formData.append('modo', modo);

  const response = await api.post('/cotacao/preview', formData);
  return response.data; // { session_id, itens }
};

export const confirmarCotacao = async (sessionId, aprovacoes) => {
  const response = await api.post(
    '/cotacao/confirmar',
    { session_id: sessionId, aprovacoes },
    { responseType: 'blob' }
  );

  const statsHeader = response.headers['x-stats'];
  const semMatchHeader = response.headers['x-sem-match'];
  const stats = statsHeader ? JSON.parse(statsHeader) : {};
  const semMatch = semMatchHeader ? JSON.parse(semMatchHeader) : [];

  return { blob: response.data, stats, semMatch };
};
