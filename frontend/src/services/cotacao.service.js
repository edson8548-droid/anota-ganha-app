import api from './api';
import { auth } from '../firebase/config';

export const listarTabelas = () => api.get('/cotacao/tabelas');

export const uploadTabela = (arquivo, nome) => {
  const formData = new FormData();
  formData.append('arquivo', arquivo);
  formData.append('nome', nome);
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
  if (!user) {
    // Wait for Firebase to initialize (up to 5s)
    await new Promise(r => setTimeout(r, 2000));
  }
  const userFinal = auth.currentUser;
  if (!userFinal) throw new Error('Faça login novamente.');
  const token = await userFinal.getIdToken();

  const headers = { Authorization: `Bearer ${token}` };

  // Wake up backend before sending the file
  try { await fetch('https://api.venpro.com.br/health', { mode: 'cors' }); } catch {}

  // Submit job
  let submitRes;
  try {
    submitRes = await fetch('https://api.venpro.com.br/api/cotacao/gerar-tabela-prazos', {
      method: 'POST',
      headers,
      body: formData,
    });
  } catch (err) {
    throw new Error('Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.');
  }

  if (!submitRes.ok) {
    const text = await submitRes.text();
    let msg = `Erro ${submitRes.status}`;
    try { msg = JSON.parse(text).detail || msg; } catch {}
    throw new Error(msg);
  }

  const { job_id } = await submitRes.json();

  // Poll for result (up to 10 minutes)
  const maxAttempts = 200;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 3000));
    onProgress?.((i + 1) * 3);

    try {
      var pollRes = await fetch(`https://api.venpro.com.br/api/cotacao/jobs/${job_id}`, { headers });
    } catch {
      continue; // network glitch, retry
    }

    if (!pollRes.ok) {
      const text = await pollRes.text();
      let msg = `Erro ${pollRes.status}`;
      try { msg = JSON.parse(text).detail || msg; } catch {}
      if (pollRes.status === 404) continue; // job not found yet, retry
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

  throw new Error('Tempo esgotado (10 min). PDFs grandes demoram mais — converta para Excel (.xlsx) antes de enviar para processar mais rápido.');
};

export const previewCotacao = async (arquivo, tabelaId, modo = 'completo', prazo = 0) => {
  const formData = new FormData();
  formData.append('arquivo', arquivo);
  formData.append('tabela_id', tabelaId);
  formData.append('modo', modo);
  formData.append('prazo', prazo);

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
