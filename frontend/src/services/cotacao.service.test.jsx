import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from './api';
import { processarCotacao } from './cotacao.service';

vi.mock('./api', () => ({
  __esModule: true,
  default: {
    post: vi.fn(),
  },
}));

vi.mock('../firebase/config', () => ({
  auth: { currentUser: null },
}));

vi.mock('../config/api', () => ({
  apiUrl: path => path,
  backendUrl: path => path,
}));

describe('processarCotacao', () => {
  beforeEach(() => {
    api.post.mockReset();
    api.post.mockResolvedValue({
      data: new Blob(['resultado']),
      headers: {},
    });
  });

  it('envia prazo, coluna e AbortSignal para o processamento em lote', async () => {
    const arquivo = new File(['cotação'], 'cotacao.xlsx');
    const controller = new AbortController();

    await processarCotacao(
      arquivo,
      'tabela-spani',
      'ean',
      'D',
      21,
      { signal: controller.signal }
    );

    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, formData, options] = api.post.mock.calls[0];
    expect(url).toBe('/cotacao/processar');
    expect(formData.get('arquivo')).toBe(arquivo);
    expect(formData.get('tabela_id')).toBe('tabela-spani');
    expect(formData.get('modo')).toBe('ean');
    expect(formData.get('coluna_preco')).toBe('D');
    expect(formData.get('prazo')).toBe('21');
    expect(options).toEqual(expect.objectContaining({
      responseType: 'blob',
      signal: controller.signal,
    }));
  });
});
