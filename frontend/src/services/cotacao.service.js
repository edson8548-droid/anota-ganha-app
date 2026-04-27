import api from './api';

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
  formData.append('pct_7',  percentuais[7]  ?? 0);
  formData.append('pct_14', percentuais[14] ?? 0);
  formData.append('pct_21', percentuais[21] ?? 0);
  formData.append('pct_28', percentuais[28] ?? 0);

  const response = await api.post('/cotacao/gerar-tabela-prazos', formData, {
    responseType: 'blob',
  });

  return response.data;
};

export const previewCotacao = async (arquivo, tabelaId, modo = 'completo') => {
  const formData = new FormData();
  formData.append('arquivo', arquivo);
  formData.append('tabela_id', tabelaId);
  formData.append('modo', modo);

  const response = await api.post('/cotacao/preview', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
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
