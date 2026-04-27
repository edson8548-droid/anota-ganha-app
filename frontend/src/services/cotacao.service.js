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

export const gerarTabelaPrazos = async (arquivo, percentuais, onProgress) => {
  const formData = new FormData();
  formData.append('arquivo', arquivo);
  formData.append('pct_7',  parseFloat(percentuais[7])  || 0);
  formData.append('pct_14', parseFloat(percentuais[14]) || 0);
  formData.append('pct_21', parseFloat(percentuais[21]) || 0);
  formData.append('pct_28', parseFloat(percentuais[28]) || 0);

  const user = auth.currentUser;
  if (!user) throw new Error('Faça login novamente.');
  const token = await user.getIdToken();

  const headers = { Authorization: `Bearer ${token}` };

  // Submit job
  const submitRes = await fetch('https://api.venpro.com.br/api/cotacao/gerar-tabela-prazos', {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!submitRes.ok) {
    const text = await submitRes.text();
    let msg = `Erro ${submitRes.status}`;
    try { msg = JSON.parse(text).detail || msg; } catch {}
    throw new Error(msg);
  }

  const { job_id } = await submitRes.json();

  // Poll for result
  const maxAttempts = 120;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 2000));
    onProgress?.((i + 1) * 2);

    const pollRes = await fetch(`https://api.venpro.com.br/api/cotacao/jobs/${job_id}`, { headers });

    if (!pollRes.ok) {
      const text = await pollRes.text();
      let msg = `Erro ${pollRes.status}`;
      try { msg = JSON.parse(text).detail || msg; } catch {}
      throw new Error(msg);
    }

    const contentType = pollRes.headers.get('content-type') || '';
    if (contentType.includes('json')) {
      const data = await pollRes.json();
      if (data.status === 'processing') continue;
      throw new Error(data.error || 'Erro desconhecido');
    }

    return pollRes.blob();
  }

  throw new Error('Tempo esgotado (4 min). Arquivo muito grande — converta PDF para Excel antes.');
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
