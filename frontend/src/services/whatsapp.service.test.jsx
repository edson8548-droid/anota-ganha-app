import { vi } from 'vitest';
import api from './api';
import {
  deletarFotos,
  getCampanha,
  limparEnviados,
  salvarMensagem,
  uploadContatos,
  uploadFotos,
} from './whatsapp.service';

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test('getCampanha chama o endpoint da campanha WhatsApp', () => {
  getCampanha();

  expect(api.get).toHaveBeenCalledWith('/whatsapp/campanha');
});

test('uploadContatos envia arquivo em FormData', () => {
  const arquivo = new File(['nome,telefone'], 'contatos.csv', { type: 'text/csv' });

  uploadContatos(arquivo);

  expect(api.post).toHaveBeenCalledWith('/whatsapp/campanha/contatos', expect.any(FormData));
  expect(api.post.mock.calls[0][1].get('arquivo')).toBe(arquivo);
});

test('uploadFotos envia todos os arquivos em FormData', () => {
  const foto1 = new File(['a'], 'foto1.jpg', { type: 'image/jpeg' });
  const foto2 = new File(['b'], 'foto2.jpg', { type: 'image/jpeg' });

  uploadFotos([foto1, foto2]);

  const form = api.post.mock.calls[0][1];
  expect(api.post).toHaveBeenCalledWith('/whatsapp/campanha/fotos', expect.any(FormData));
  expect(form.getAll('arquivos')).toEqual([foto1, foto2]);
});

test('deletarFotos chama o endpoint de fotos', () => {
  deletarFotos();

  expect(api.delete).toHaveBeenCalledWith('/whatsapp/campanha/fotos');
});

test('limparEnviados chama o endpoint que zera enviados', () => {
  limparEnviados();

  expect(api.delete).toHaveBeenCalledWith('/whatsapp/campanha/enviados');
});

test('salvarMensagem envia a mensagem no corpo esperado', () => {
  salvarMensagem('Oferta da semana');

  expect(api.put).toHaveBeenCalledWith('/whatsapp/campanha/mensagem', {
    message: 'Oferta da semana',
  });
});
