jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
}));

jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({})),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({
    currentUser: {
      getIdToken: jest.fn(() => Promise.resolve('token-123')),
    },
  })),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
}));

jest.mock('../config/api', () => ({
  BACKEND_URL: 'https://api.venpro.com.br',
  API_BASE_URL: 'https://api.venpro.com.br/api',
  backendUrl: path => `https://api.venpro.com.br${path.startsWith('/') ? path : `/${path}`}`,
  apiUrl: path => `https://api.venpro.com.br/api${path.startsWith('/') ? path : `/${path}`}`,
}));

const axios = require('axios');
const { vitrineService } = require('./vitrine.service');

beforeEach(() => {
  jest.clearAllMocks();
});

test('listar busca ofertas autenticadas', async () => {
  await vitrineService.listar();

  expect(axios.get).toHaveBeenCalledWith('https://api.venpro.com.br/api/vitrine/ofertas', {
    headers: { 'Content-Type': 'application/json' },
  });
});

test('criar envia dados da oferta', async () => {
  const data = { titulo: 'Oferta maio' };

  await vitrineService.criar(data);

  expect(axios.post).toHaveBeenCalledWith('https://api.venpro.com.br/api/vitrine/ofertas', data, {
    headers: { 'Content-Type': 'application/json' },
  });
});

test('uploadImagem envia arquivo em FormData sem content-type manual', async () => {
  const file = new File(['img'], 'produto.png', { type: 'image/png' });

  await vitrineService.uploadImagem('oferta-1', 'item-1', file);

  const form = axios.post.mock.calls[0][1];
  expect(axios.post).toHaveBeenCalledWith(
    'https://api.venpro.com.br/api/vitrine/ofertas/oferta-1/items/item-1/imagem',
    expect.any(FormData),
    { headers: {} },
  );
  expect(form.get('arquivo')).toBe(file);
});

test('obterPublica busca oferta publica sem auth', async () => {
  await vitrineService.obterPublica('oferta-teste');

  expect(axios.get).toHaveBeenCalledWith('https://api.venpro.com.br/api/vitrine/publica/oferta-teste');
});

test('gerarLinkPublico usa origem atual', () => {
  expect(vitrineService.gerarLinkPublico('oferta-teste')).toBe('http://localhost/oferta/oferta-teste');
});

test('gerarLinkPublico inclui nome da empresa quando informado', () => {
  expect(vitrineService.gerarLinkPublico('oferta-teste', 'Spani Atacadista')).toBe(
    'http://localhost/spani-atacadista/ofertas/oferta-teste',
  );
});

test('gerarEmpresaSlug remove acentos e caracteres especiais', () => {
  expect(vitrineService.gerarEmpresaSlug('São José Distribuição')).toBe('sao-jose-distribuicao');
});
