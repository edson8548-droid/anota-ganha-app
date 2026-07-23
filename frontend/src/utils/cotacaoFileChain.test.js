import { describe, expect, it } from 'vitest';
import {
  criarArquivoCotacaoEncadeado,
  defaultCotacaoFilename,
  ensureXlsxFilename,
} from './cotacaoFileChain';

describe('cotacaoFileChain', () => {
  it('normaliza o nome do arquivo como xlsx', () => {
    expect(ensureXlsxFilename('Cotação: Alvorada.xls')).toBe('Cotação Alvorada.xlsx');
    expect(ensureXlsxFilename('')).toBe('cotacao_preenchida.xlsx');
  });

  it('não repete o sufixo preenchida nas rodadas seguintes', () => {
    expect(defaultCotacaoFilename({ name: 'ALVORADA.xlsx' })).toBe('ALVORADA_preenchida.xlsx');
    expect(defaultCotacaoFilename({ name: 'ALVORADA_preenchida.xlsx' })).toBe('ALVORADA_preenchida.xlsx');
  });

  it('transforma o resultado salvo em arquivo reutilizável no próximo processamento', () => {
    const blob = new Blob(['resultado'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const arquivo = criarArquivoCotacaoEncadeado(blob, 'ALVORADA_preenchida.xlsx', 123456);
    const formData = new FormData();
    formData.append('arquivo', arquivo);

    expect(arquivo).toBeInstanceOf(File);
    expect(arquivo.name).toBe('ALVORADA_preenchida.xlsx');
    expect(arquivo.size).toBe(blob.size);
    expect(arquivo.lastModified).toBe(123456);
    expect(formData.get('arquivo')).toBe(arquivo);
  });

  it('rejeita resultado inválido antes de substituir a cotação atual', () => {
    expect(() => criarArquivoCotacaoEncadeado(null, 'cotacao.xlsx')).toThrow(TypeError);
  });
});
