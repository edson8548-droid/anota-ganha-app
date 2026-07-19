import { describe, expect, it } from 'vitest';
import { findImportedIndustry } from './campaignIndustryMatch';

describe('findImportedIndustry', () => {
  it('cruza nomes simples e nomes marcados como Turbinado', () => {
    const imported = { Camil: { sales: 100 } };
    expect(findImportedIndustry('Camil — Turbinado', imported)).toEqual({ sales: 100 });
  });

  it('cruza aliases compostos independentemente da ordem', () => {
    const imported = { 'Softys Falcon': { sales: 200 } };
    expect(findImportedIndustry('Falcon/Softys — Turbinado', imported)).toEqual({ sales: 200 });
  });
});
