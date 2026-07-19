import { describe, expect, it, vi } from 'vitest';

vi.mock('./TabelaPickerModal', () => ({ default: () => null }));
vi.mock('./ConfirmDialog', () => ({ default: () => null }));

import {
  aplicarEdicaoPendente,
  normalizarMestreParaFormulario,
  ordenarProdutosPorNome,
} from './MasterCampaignModal';

describe('normalizarMestreParaFormulario', () => {
  it('aceita categorias legadas, datas completas e valores numéricos', () => {
    const result = normalizarMestreParaFormulario({
      nome: 'Campanha SP',
      categorias: 'Turbinado',
      startDate: '2026-07-01T00:00:00Z',
      industries: {
        Camil: { produtos: { Arroz: { codigo: 123, ean: 789 } } },
      },
    });

    expect(result.categorias).toBe('Turbinado');
    expect(result.startDate).toBe('2026-07-01');
    expect(result.industries[0].products[0]).toMatchObject({
      nome: 'Arroz',
      codigo: '123',
      ean: '789',
    });
  });

  it('ordena produtos alfabeticamente sem diferenciar maiúsculas e acentos', () => {
    const result = ordenarProdutosPorNome([
      { nome: 'Zebra' },
      { nome: 'ábaco' },
      { nome: 'Arroz 10' },
      { nome: 'Arroz 2' },
    ]);

    expect(result.map(item => item.nome)).toEqual(['ábaco', 'Arroz 2', 'Arroz 10', 'Zebra']);
  });

  it('normaliza produtos legados em ordem alfabética', () => {
    const result = normalizarMestreParaFormulario({
      industries: {
        Camil: {
          produtos: {
            Feijao: { nome: 'Feijão' },
            Arroz: { nome: 'Arroz' },
          },
        },
      },
    });

    expect(result.industries[0].products.map(item => item.nome)).toEqual(['Arroz', 'Feijão']);
  });

  it('incorpora os produtos da indústria em edição no salvamento geral', () => {
    const result = aplicarEdicaoPendente(
      [{ id: 7, name: 'Camil', products: [{ nome: 'Arroz' }] }],
      { name: 'Camil', products: [{ nome: 'Feijão' }, { nome: 'Arroz' }] },
      7,
    );

    expect(result[0].products.map(item => item.nome)).toEqual(['Arroz', 'Feijão']);
  });

  it('bloqueia o salvamento de um rascunho incompleto', () => {
    expect(aplicarEdicaoPendente([], { name: 'Camil', products: [] }, null)).toBeNull();
  });
});
