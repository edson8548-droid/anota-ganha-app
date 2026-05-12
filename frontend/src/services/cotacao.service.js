import api from './api';
import { auth } from '../firebase/config';
import { apiUrl, backendUrl } from '../config/api';

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
  const buildFormData = () => {
    const formData = new FormData();
    formData.append('arquivo', arquivo);
    formData.append('pct_7',  parseFloat(percentuais[7])  || 0);
    formData.append('pct_14', parseFloat(percentuais[14]) || 0);
    formData.append('pct_21', parseFloat(percentuais[21]) || 0);
    formData.append('pct_28', parseFloat(percentuais[28]) || 0);
    return formData;
  };

  const user = auth.currentUser;
  if (!user) {
    // Wait for Firebase to initialize (up to 5s)
    await new Promise(r => setTimeout(r, 2000));
  }
  const userFinal = auth.currentUser;
  if (!userFinal) throw new Error('Faça login novamente.');
  const token = await userFinal.getIdToken();

  const headers = { Authorization: `Bearer ${token}` };

  const wakeBackend = async () => {
    try { await fetch(backendUrl('/health'), { mode: 'cors' }); } catch {}
  };

  const submitJob = async () => {
    let submitRes;
    try {
      submitRes = await fetch(apiUrl('/cotacao/gerar-tabela-prazos'), {
        method: 'POST',
        headers,
        body: buildFormData(),
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
    return job_id;
  };

  const pollJob = async (jobId, retryOffsetSeconds = 0) => {
    // Poll for result (up to 20 minutes)
    const maxAttempts = 400;
    let notFoundAttempts = 0;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 3000));
      onProgress?.(retryOffsetSeconds + ((i + 1) * 3));

      let pollRes;
      try {
        pollRes = await fetch(apiUrl(`/cotacao/jobs/${jobId}`), { headers });
      } catch {
        continue; // network glitch, retry
      }

      if (!pollRes.ok) {
        const text = await pollRes.text();
        let msg = `Erro ${pollRes.status}`;
        try { msg = JSON.parse(text).detail || msg; } catch {}
        if (pollRes.status === 404 && notFoundAttempts < 3) {
          notFoundAttempts += 1;
          continue; // short propagation delay after submit/redeploy
        }
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

    throw new Error('Tempo esgotado (20 min). PDFs grandes demoram mais — converta para Excel (.xlsx) antes de enviar para processar mais rápido.');
  };

  const isServerRestartError = (err) =>
    /servidor reiniciou durante o processamento/i.test(err?.message || '');

  await wakeBackend();

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const jobId = await submitJob();
      return await pollJob(jobId, attempt * 15);
    } catch (err) {
      if (attempt === 0 && isServerRestartError(err)) {
        await wakeBackend();
        continue;
      }
      throw err;
    }
  }
};

export const previewCotacao = async (arquivo, tabelaId, modo = 'completo', prazo = 0) => {
  const formData = new FormData();
  formData.append('arquivo', arquivo);
  formData.append('tabela_id', tabelaId);
  formData.append('modo', modo);
  formData.append('prazo', prazo);

  const user = auth.currentUser;
  if (!user) {
    await new Promise(r => setTimeout(r, 2000));
  }
  const userFinal = auth.currentUser;
  if (!userFinal) throw new Error('Faça login novamente.');
  const token = await userFinal.getIdToken();
  const headers = { Authorization: `Bearer ${token}` };

  let submitRes;
  try {
    submitRes = await fetch(apiUrl('/cotacao/preview-async'), {
      method: 'POST',
      headers,
      body: formData,
    });
  } catch {
    throw new Error('Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.');
  }

  if (!submitRes.ok) {
    const text = await submitRes.text();
    let msg = `Erro ${submitRes.status}`;
    try { msg = JSON.parse(text).detail || msg; } catch {}
    throw new Error(msg);
  }

  const { job_id } = await submitRes.json();
  const maxAttempts = 400;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 3000));

    let pollRes;
    try {
      pollRes = await fetch(apiUrl(`/cotacao/preview-jobs/${job_id}`), { headers });
    } catch {
      continue;
    }

    if (!pollRes.ok) {
      const text = await pollRes.text();
      let msg = `Erro ${pollRes.status}`;
      try { msg = JSON.parse(text).detail || msg; } catch {}
      throw new Error(msg);
    }

    const data = await pollRes.json();
    if (data.status === 'processing') continue;
    return data; // { session_id, itens }
  }

  throw new Error('Tempo esgotado (20 min). Tente novamente com uma cotação menor ou em modo rápido.');
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
