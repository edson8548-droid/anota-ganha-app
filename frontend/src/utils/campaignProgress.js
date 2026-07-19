const CENT = 0.01;

export const buildCampaignProgress = (result = {}) => {
  const industries = Object.entries(result.industries || {}).map(([name, raw]) => {
    const sales = Number(raw.sales) || 0;
    const minimumSales = Number(raw.minimumSales) || 0;
    const clients = Number(raw.quantity) || 0;
    const clientTarget = Number(raw.targetQuantity) || 0;
    const salesRequired = minimumSales > 0 ? minimumSales + CENT : 0;
    const salesMet = salesRequired > 0 && sales >= salesRequired;
    const clientsMet = clientTarget > 0 && clients >= clientTarget;
    const salesProgress = salesRequired > 0 ? (sales / salesRequired) * 100 : 0;
    const clientsProgress = clientTarget > 0 ? (clients / clientTarget) * 100 : 0;
    return {
      name,
      sales,
      minimumSales,
      clients,
      clientTarget,
      salesMet,
      clientsMet,
      qualified: salesMet && clientsMet,
      salesProgress,
      clientsProgress,
      missingSales: Math.max(salesRequired - sales, 0),
      missingClients: Math.max(clientTarget - clients, 0),
      opportunityScore: Math.min(salesProgress, clientsProgress),
    };
  });

  industries.sort((a, b) => {
    if (a.qualified !== b.qualified) return a.qualified ? 1 : -1;
    return b.opportunityScore - a.opportunityScore || a.name.localeCompare(b.name, 'pt-BR');
  });

  const totalSales = industries.reduce((sum, item) => sum + item.sales, 0);
  const previousSales = industries.reduce((sum, item) => sum + item.minimumSales, 0);
  const totalPrize = Number(result.totalPrize) || 0;
  const qualifiedCount = industries.filter(item => item.qualified).length;
  const growth = previousSales > 0 ? ((totalSales / previousSales) - 1) * 100 : 0;

  return {
    industries,
    totalSales,
    previousSales,
    totalPrize,
    qualifiedCount,
    growth,
    nextAction: industries.find(item => !item.qualified) || null,
  };
};
