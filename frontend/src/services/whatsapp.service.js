import api from './api';

export const getCampanha = () => api.get('/whatsapp/campanha');

export const uploadContatos = (arquivo) => {
  const form = new FormData();
  form.append('arquivo', arquivo);
  return api.post('/whatsapp/campanha/contatos', form);
};

export const uploadFotos = (arquivos) => {
  const form = new FormData();
  arquivos.forEach(f => form.append('arquivos', f));
  return api.post('/whatsapp/campanha/fotos', form);
};

export const deletarFotos = () => api.delete('/whatsapp/campanha/fotos');

export const salvarMensagem = (message) =>
  api.put('/whatsapp/campanha/mensagem', { message });

export const sugerirMensagemIA = (descricao) =>
  api.post('/whatsapp/campanha/ia-mensagem', { descricao });
