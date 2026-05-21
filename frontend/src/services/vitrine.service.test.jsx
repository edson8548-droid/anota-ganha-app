import { vi } from 'vitest';
import axios from 'axios';
import { vitrineService } from './vitrine.service';

vi.mock('axios', () => ({
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

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({
    currentUser: {
      getIdToken: vi.fn(() => Promise.resolve('token-123')),
    },
  })),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
}));

vi.mock('../config/api', () => ({
  BACKEND_URL: 'https://api.venpro.com.br',
  API_BASE_URL: 'https://api.venpro.com.br/api',
  backendUrl: path => `https://api.venpro.com.br${path.startsWith('/') ? path : `/${path}`}`,
  apiUrl: path => `https://api.venpro.com.br/api${path.startsWith('/') ? path : `/${path}`}`,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test('listar busca ofertas autenticadas', async () => {
  await vitrineService.listar();

  expect(axios.get).toHaveBeenCalledWith('https://api.venpro.com.br/api/vitrine/ofertas', {
    headers: {
      Authorization: 'Bearer token-123',
      'Content-Type': 'application/json',
    },
  });
});

test('criar envia dados da oferta', async () => {
  const data = { titulo: 'Oferta maio' };

  await vitrineService.criar(data);

  expect(axios.post).toHaveBeenCalledWith('https://api.venpro.com.br/api/vitrine/ofertas', data, {
    headers: {
      Authorization: 'Bearer token-123',
      'Content-Type': 'application/json',
    },
  });
});

test('uploadImagem envia arquivo em FormData sem content-type manual', async () => {
  const file = new File(['img'], 'produto.png', { type: 'image/png' });

  await vitrineService.uploadImagem('oferta-1', 'item-1', file);

  const form = axios.post.mock.calls[0][1];
  expect(axios.post).toHaveBeenCalledWith(
    'https://api.venpro.com.br/api/vitrine/ofertas/oferta-1/items/item-1/imagem',
    expect.any(FormData),
    { headers: { Authorization: 'Bearer token-123' } },
  );
  expect(form.get('arquivo')).toBe(file);
});

test('obterPublica busca oferta publica sem auth', async () => {
  await vitrineService.obterPublica('oferta-teste');

  expect(axios.get).toHaveBeenCalledWith('https://api.venpro.com.br/api/vitrine/publica/oferta-teste');
});

test('gerarLinkPublico usa origem atual', () => {
  expect(vitrineService.gerarLinkPublico('oferta-teste')).toBe(`${window.location.origin}/oferta/oferta-teste`);
});

test('gerarLinkPublico inclui nome da empresa quando informado', () => {
  expect(vitrineService.gerarLinkPublico('oferta-teste', 'Spani Atacadista')).toBe(
    `${window.location.origin}/spani-atacadista/ofertas/oferta-teste`,
  );
});

test('gerarEmpresaSlug remove acentos e caracteres especiais', () => {
  expect(vitrineService.gerarEmpresaSlug('São José Distribuição')).toBe('sao-jose-distribuicao');
});
