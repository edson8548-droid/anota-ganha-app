import { describe, expect, it } from 'vitest';
import { buildCampaignProgress } from './campaignProgress';

describe('buildCampaignProgress', () => {
  it('exige crescimento real e meta de clientes simultaneamente', () => {
    const base = { industries: { Camil: { minimumSales: 10000, sales: 10000, targetQuantity: 20, quantity: 60 } } };
    expect(buildCampaignProgress(base).industries[0].qualified).toBe(false);

    base.industries.Camil.sales = 11000;
    expect(buildCampaignProgress(base).industries[0].qualified).toBe(true);
  });

  it('calcula totais, crescimento e próxima ação', () => {
    const progress = buildCampaignProgress({
      totalPrize: 50,
      industries: {
        Distante: { minimumSales: 10000, sales: 2000, targetQuantity: 20, quantity: 2 },
        Perto: { minimumSales: 10000, sales: 9000, targetQuantity: 20, quantity: 19 },
      },
    });
    expect(progress.totalSales).toBe(11000);
    expect(progress.previousSales).toBe(20000);
    expect(progress.growth).toBeCloseTo(-45);
    expect(progress.nextAction.name).toBe('Perto');
  });
});
