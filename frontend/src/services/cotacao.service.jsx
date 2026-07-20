import api from './api';
import { auth } from '../firebase/config';
import { apiUrl, backendUrl } from '../config/api';

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const isConnectionError = (err) =>
  err instanceof TypeError ||
  /Failed to fetch|NetworkError|Load failed|Network request failed/i.test(err?.message || '');

async function fetchHealthWithTimeout(timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(backendUrl('/health'), {
      mode: 'cors',
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function waitForBackend(maxWaitMs = 60000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetchHealthWithTimeout();
      if (res.ok) return true;
    } catch {
      // backend ainda reiniciando/acordando
    }
    await wait(2000);
  }
  return false;
}

const connectionMessage = 'Não foi possível conectar ao servidor. Aguarde alguns segundos e tente novamente.';

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

export const cancelarTabelaPrazos = async (jobId) => {
  if (!jobId) return;
  const user = auth.currentUser;
  if (!user) return;
  const token = await user.getIdToken();
  await fetch(apiUrl(`/cotacao/jobs/${jobId}`), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
};

export const gerarTabelaPrazos = async (arquivo, percentuais, onProgress, options = {}) => {
  const buildFormData = () => {
    const formData = new FormData();
    formData.append('arquivo', arquivo);
    formData.append('pct_7',  parseFloat(percentuais[7])  || 0);
    formData.append('pct_14', parseFloat(percentuais[14]) || 0);
    formData.append('pct_21', parseFloat(percentuais[21]) || 0);
    formData.append('pct_28', parseFloat(percentuais[28]) || 0);
    formData.append('pct_35', parseFloat(percentuais[35]) || 0);
    formData.append('pct_42', parseFloat(percentuais[42]) || 0);
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

  const submitJob = async () => {
    let submitRes;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        submitRes = await fetch(apiUrl('/cotacao/gerar-tabela-prazos'), {
          method: 'POST',
          headers,
          body: buildFormData(),
          signal: options.signal,
        });
        break;
      } catch (err) {
        if (options.signal?.aborted) {
          throw new DOMException('Processamento cancelado', 'AbortError');
        }
        if (attempt === 0 && isConnectionError(err)) {
          await waitForBackend();
          continue;
        }
        throw new Error(connectionMessage);
      }
    }

    if (!submitRes.ok) {
      const text = await submitRes.text();
      let msg = `Erro ${submitRes.status}`;
      try { msg = JSON.parse(text).detail || msg; } catch {}
      throw new Error(msg);
    }

    const { job_id } = await submitRes.json();
    options.onJobId?.(job_id);
    return job_id;
  };

  const pollJob = async (jobId, retryOffsetSeconds = 0) => {
    // Poll for result (up to 20 minutes)
    const maxAttempts = 400;
    let notFoundAttempts = 0;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 3000));
      if (options.signal?.aborted) {
        throw new DOMException('Processamento cancelado', 'AbortError');
      }
      onProgress?.(retryOffsetSeconds + ((i + 1) * 3));

      let pollRes;
      try {
        pollRes = await fetch(apiUrl(`/cotacao/jobs/${jobId}`), { headers, signal: options.signal });
      } catch {
        if (options.signal?.aborted) {
          throw new DOMException('Processamento cancelado', 'AbortError');
        }
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
        if (data.status === 'processing') {
          if (data.progress) options.onServerProgress?.(data.progress);
          continue;
        }
        throw new Error(data.error || 'Erro desconhecido');
      }

      return pollRes.blob();
    }

    throw new Error('Tempo esgotado (20 min). Envie uma planilha Excel (.xlsx) menor ou tente novamente.');
  };

  const isServerRestartError = (err) =>
    /servidor reiniciou durante o processamento/i.test(err?.message || '');

  await waitForBackend(10000);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const jobId = await submitJob();
      return await pollJob(jobId, attempt * 15);
    } catch (err) {
      if (attempt === 0 && isServerRestartError(err)) {
        await waitForBackend();
        continue;
      }
      throw err;
    }
  }
};

export const cancelarPreviewCotacao = async (jobId) => {
  if (!jobId) return;
  const user = auth.currentUser;
  if (!user) return;
  const token = await user.getIdToken();
  try {
    await fetch(apiUrl(`/cotacao/preview-jobs/${jobId}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    await fetch(apiUrl(`/cotacao/preview-jobs/${jobId}/cancel-simple`), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: token,
    });
  }
};

export const previewCotacao = async (arquivo, tabelaId, modo = 'completo', prazo = 0, options = {}) => {
  const buildFormData = (authToken = '') => {
    const formData = new FormData();
    formData.append('arquivo', arquivo);
    formData.append('tabela_id', tabelaId);
    formData.append('modo', modo);
    formData.append('prazo', prazo);
    if (authToken) formData.append('auth_token', authToken);
    return formData;
  };

  const user = auth.currentUser;
  if (!user) {
    await new Promise(r => setTimeout(r, 1500));
  }
  const userFinal = auth.currentUser;
  if (!userFinal) throw new Error('Faça login novamente.');
  const token = await userFinal.getIdToken();
  const headers = { Authorization: `Bearer ${token}` };

  await waitForBackend(10000);

  let submitRes;
  let useSimplePreviewApi = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      submitRes = await fetch(apiUrl('/cotacao/preview-async'), {
        method: 'POST',
        headers,
        body: buildFormData(),
        signal: options.signal,
      });
      break;
    } catch (err) {
      if (options.signal?.aborted) {
        throw new DOMException('Processamento cancelado', 'AbortError');
      }
      if (attempt === 0 && isConnectionError(err)) {
        await waitForBackend();
        continue;
      }
      if (isConnectionError(err)) {
        try {
          submitRes = await fetch(apiUrl('/cotacao/preview-async-simple'), {
            method: 'POST',
            body: buildFormData(token),
            signal: options.signal,
          });
          useSimplePreviewApi = true;
          break;
        } catch (fallbackErr) {
          if (options.signal?.aborted) {
            throw new DOMException('Processamento cancelado', 'AbortError');
          }
          throw new Error(connectionMessage);
        }
      }
      throw err;
    }
  }

  if (!submitRes.ok) {
    const text = await submitRes.text();
    let msg = `Erro ${submitRes.status}`;
    try { msg = JSON.parse(text).detail || msg; } catch {}
    throw new Error(msg);
  }

  const { job_id: jobId } = await submitRes.json();
  options.onJobId?.(jobId);
  const maxAttempts = 180; // 9 minutos, alinhado ao limite do backend
  let notFoundAttempts = 0;
  let pollWithSimpleApi = useSimplePreviewApi;
  let pollNetworkErrors = 0;

  for (let i = 0; i < maxAttempts; i += 1) {
    await new Promise(r => setTimeout(r, 3000));
    if (options.signal?.aborted) {
      throw new DOMException('Processamento cancelado', 'AbortError');
    }
    let pollRes;
    try {
      if (pollWithSimpleApi) {
        pollRes = await fetch(apiUrl(`/cotacao/preview-jobs/${jobId}/status-simple`), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: token,
          signal: options.signal,
        });
      } else {
        pollRes = await fetch(apiUrl(`/cotacao/preview-jobs/${jobId}`), { headers, signal: options.signal });
      }
      pollNetworkErrors = 0;
    } catch (err) {
      if (options.signal?.aborted) {
        throw new DOMException('Processamento cancelado', 'AbortError');
      }
      if (!pollWithSimpleApi && isConnectionError(err)) {
        pollNetworkErrors += 1;
        if (pollNetworkErrors >= 2) {
          pollWithSimpleApi = true;
        }
      }
      continue;
    }

    if (!pollRes.ok) {
      const text = await pollRes.text();
      let msg = `Erro ${pollRes.status}`;
      try { msg = JSON.parse(text).detail || msg; } catch {}
      if (pollRes.status === 404 && notFoundAttempts < 3) {
        notFoundAttempts += 1;
        continue;
      }
      throw new Error(msg);
    }

    const data = await pollRes.json();
    if (data.status === 'processing') continue;
    return data; // { session_id, itens }
  }

  throw new Error('Tempo esgotado. Tente novamente em modo EAN ou com uma cotação menor.');
};

export const confirmarCotacao = async (sessionId, aprovacoes, precosEditados) => {
  const response = await api.post(
    '/cotacao/confirmar',
    { session_id: sessionId, aprovacoes, precos_editados: precosEditados },
    { responseType: 'blob' }
  );

  const statsHeader = response.headers['x-stats'];
  const semMatchHeader = response.headers['x-sem-match'];
  const stats = statsHeader ? JSON.parse(statsHeader) : {};
  const semMatch = semMatchHeader ? JSON.parse(semMatchHeader) : [];

  return { blob: response.data, stats, semMatch };
};
