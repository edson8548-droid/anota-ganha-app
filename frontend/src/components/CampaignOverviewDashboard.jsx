import React, { useMemo } from 'react';
import { BarChart3, Target, Trophy, Users } from 'lucide-react';
import { buildCampaignProgress } from '../utils/campaignProgress';
import { industryWords } from '../utils/campaignIndustryMatch';

const currency = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL',
}).format(Number(value) || 0);

const findCampaignIndustryName = (importedName, campaignIndustries = {}) => {
  const key = industryWords(importedName).join('|');
  return Object.keys(campaignIndustries).find(name => industryWords(name).join('|') === key) || '';
};

const countTrackedClients = (industryName, clients = [], campaignIndustries = {}) => {
  const campaignName = findCampaignIndustryName(industryName, campaignIndustries);
  if (!campaignName) return 0;
  return clients.filter(client => Object.values(client.industries?.[campaignName] || {})
    .some(product => product?.positivado)).length;
};

export default function CampaignOverviewDashboard({ campaign, clients = [], onOpenAnalytics, onOpenRaioX }) {
  const progress = useMemo(() => buildCampaignProgress(campaign?.rcaResult), [campaign?.rcaResult]);
  if (!campaign?.rcaResult?.industries || progress.industries.length === 0) return null;

  const next = progress.nextAction;
  const updatedAt = campaign.rcaResult.periodEnd;

  return (
    <section className="campaign-overview" aria-label="Resumo da campanha">
      <div className="campaign-overview-heading">
        <div>
          <span className="campaign-overview-eyebrow">SEU PLACAR DA CAMPANHA</span>
          <h2>Veja onde você está e qual é a próxima oportunidade</h2>
          <p>{updatedAt ? `Dados do Excel até ${new Date(`${updatedAt}T12:00:00`).toLocaleDateString('pt-BR')}` : 'Dados da última planilha enviada'}</p>
        </div>
        <div className="campaign-overview-shortcuts">
          <button type="button" onClick={onOpenRaioX}><Users size={16} /> Abrir Raio-X</button>
          <button type="button" onClick={onOpenAnalytics}><BarChart3 size={16} /> Ver Analytics</button>
        </div>
      </div>

      <div className="campaign-overview-kpis">
        <article><span>Vendido no trimestre</span><strong>{currency(progress.totalSales)}</strong><small>Excel enviado pelo RCA</small></article>
        <article><span>Crescimento geral</span><strong className={progress.growth >= 0 ? 'positive' : 'negative'}>{progress.growth >= 0 ? '+' : ''}{progress.growth.toFixed(1)}%</strong><small>Comparado ao trimestre anterior</small></article>
        <article><span>Indústrias elegíveis</span><strong>{progress.qualifiedCount} de {progress.industries.length}</strong><small>Vendas e clientes cumpridos</small></article>
        <article><span>Prêmio acumulado</span><strong>{currency(progress.totalPrize)}</strong><small>Itens premiados apurados</small></article>
      </div>

      {next && (
        <div className="campaign-overview-next-action">
          <Target size={21} />
          <div>
            <strong>Próxima melhor ação: {next.name}</strong>
            <span>
              {next.missingSales > 0 ? `Faltam ${currency(next.missingSales)} em vendas. ` : 'Vendas cumpridas. '}
              {next.missingClients > 0 ? `Faltam ${next.missingClients} clientes.` : 'Meta de clientes cumprida.'}
            </span>
          </div>
        </div>
      )}

      <div className="campaign-overview-industries">
        {progress.industries.map(item => {
          const tracked = countTrackedClients(item.name, clients, campaign.industries);
          const unidentified = Math.max(item.clients - tracked, 0);
          return (
            <article key={item.name} className={item.qualified ? 'qualified' : ''}>
              <header>
                <strong>{item.name}</strong>
                <span>{item.qualified ? <><Trophy size={14} /> Requisitos cumpridos</> : 'Em andamento'}</span>
              </header>
              <div className="campaign-overview-progress-label"><span>Vendas</span><b>{item.salesProgress.toFixed(0)}%</b></div>
              <div className="campaign-overview-progress"><i style={{ width: `${Math.min(item.salesProgress, 100)}%` }} /></div>
              <small>{currency(item.sales)} · precisa superar {currency(item.minimumSales)}</small>
              <div className="campaign-overview-progress-label"><span>Clientes</span><b>{item.clientsProgress.toFixed(0)}%</b></div>
              <div className="campaign-overview-progress clients"><i style={{ width: `${Math.min(item.clientsProgress, 100)}%` }} /></div>
              <small>{item.clients} realizados de {item.clientTarget}</small>
              <footer className={unidentified > 0 ? 'attention' : ''}>
                Raio-X: {tracked} identificados{unidentified > 0 ? ` · faltam identificar ${unidentified}` : ' · conferido'}
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
