import { describe, expect, it, vi } from 'vitest';

vi.mock('./TabelaPickerModal', () => ({ default: () => null }));
vi.mock('./ConfirmDialog', () => ({ default: () => null }));

import { normalizarMestreParaFormulario } from './MasterCampaignModal';

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
});
