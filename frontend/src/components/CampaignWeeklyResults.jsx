import React, { useState } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { campaignsService } from '../services/campaigns.service';
import { buildCampaignProgress } from '../utils/campaignProgress';
import CampaignOverviewDashboard from './CampaignOverviewDashboard';

const currency = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number(value) || 0);

export default function CampaignWeeklyResults({ campaign, clients, onUploaded, onOpenAnalytics, onOpenRaioX }) {
  const [uploading, setUploading] = useState(false);
  const [rcaCode, setRcaCode] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const [preview, setPreview] = useState(null);
  if (!campaign?.isShared || !campaign?.masterId) return null;

  const summary = campaign.weeklySummary || {};
  const result = campaign.rcaResult || {};
  const achievedIndustries = buildCampaignProgress(result).industries.filter(item => item.qualified);
  const prizeRules = Object.entries(campaign.industries || {}).flatMap(([industryName, industry]) =>
    Object.entries(industry || {})
      .filter(([, product]) => product && typeof product === 'object' && Number(product.premioPorCaixa) > 0)
      .map(([productName, product]) => ({ industryName, productName, ...product }))
  );

  const upload = async (file, confirmar = false) => {
    if (!file) return;
    const code = campaign.rcaCode || rcaCode.trim();
    if (!code) {
      toast.error('Informe seu código RCA antes de selecionar a planilha.');
      return;
    }
    try {
      setUploading(true);
      const response = await campaignsService.importarMinhaApuracao(
        campaign.masterId,
        file,
        code,
        confirmar || !!campaign.rcaCode,
      );
      if (response.requiresConfirmation) {
        setPendingFile(file);
        setPreview(response);
        return;
      }
      await onUploaded?.();
      setPendingFile(null);
      setPreview(null);
      toast.success('Sua apuração foi atualizada pelo código RCA vinculado.');
    } catch (err) {
      toast.error('Erro ao atualizar apuração: ' + (err?.response?.data?.detail || err.message));
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="campaign-weekly-results">
      <div className="campaign-weekly-header">
        <div>
          <strong className="campaign-weekly-title">🏆 Itens Premiados</strong>
          <div className="campaign-weekly-meta">
            Código RCA: {campaign.rcaCode || 'não vinculado'}
            {(summary.periodEnd || result.periodEnd) ? ` · apuração até ${new Date(`${summary.periodEnd || result.periodEnd}T12:00:00`).toLocaleDateString('pt-BR')}` : ''}
          </div>
        </div>
        <div className="campaign-weekly-actions">
          {!campaign.rcaCode && (
            <input
              type="text"
              inputMode="numeric"
              value={rcaCode}
              onChange={(event) => setRcaCode(event.target.value.replace(/\D/g, ''))}
              placeholder="Seu código RCA (ex.: 614)"
              aria-label="Seu código RCA"
              disabled={uploading || !!preview}
              className="campaign-weekly-code-input"
            />
          )}
          <label className="btn-campaign-action secondary" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
            <Upload size={15} /> {uploading ? 'Verificando...' : 'Subir Excel semanal'}
            <input
              type="file"
              accept=".xlsx"
              hidden
              disabled={uploading || !!preview}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                upload(file);
              }}
            />
          </label>
        </div>
      </div>

      <CampaignOverviewDashboard
        campaign={campaign}
        clients={clients}
        onOpenAnalytics={onOpenAnalytics}
        onOpenRaioX={onOpenRaioX}
      />

      {preview?.requiresConfirmation && (
        <div className="campaign-weekly-confirmation">
          <strong>Confirme seu código antes de vincular</strong>
          <p style={{ margin: '6px 0', fontSize: 13 }}>
            Código {preview.profile?.code} · {preview.profile?.name || 'Nome não informado'}
            {preview.periodEnd ? ` · apuração até ${new Date(`${preview.periodEnd}T12:00:00`).toLocaleDateString('pt-BR')}` : ''}
          </p>
          <p className="campaign-weekly-confirmation-note">
            Depois de confirmar, somente o administrador poderá alterar este código.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-campaign-action primary" disabled={uploading} onClick={() => upload(pendingFile, true)}>
              {uploading ? 'Vinculando...' : 'Sim, este é meu cadastro'}
            </button>
            <button type="button" className="btn-campaign-action secondary" disabled={uploading} onClick={() => { setPreview(null); setPendingFile(null); }}>
              Corrigir código
            </button>
          </div>
        </div>
      )}

      {Array.isArray(summary.suppliers) && summary.suppliers.length > 0 && (
        <div className="campaign-weekly-suppliers">
          {summary.suppliers.map(item => (
            <div key={item.name} className="campaign-weekly-supplier-card">
              <strong>{item.name}</strong>
              <div style={{ fontSize: 12, marginTop: 6 }}>Meta geral: {currency(item.goal)}</div>
              <div style={{ fontSize: 12 }}>Vendido: {currency(item.realized)}</div>
              <div style={{ fontSize: 12 }}>Falta: {currency(item.remaining)}</div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{Number(item.percentage || 0).toFixed(1)}%</div>
            </div>
          ))}
        </div>
      )}

      {prizeRules.length > 0 && (
        <div className="campaign-weekly-section">
          <strong>Produtos e prêmio por caixa</strong>
          {prizeRules.map(item => (
            <div key={`${item.industryName}:${item.productName}`} className="campaign-weekly-row">
              <span>{item.industryName} · {item.productName}</span>
              <span>
                {currency(item.premioPorCaixa)} por caixa
                {Number(item.limiteMaximo) > 0 ? ` · limite ${currency(item.limiteMaximo)}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {Array.isArray(result.awardedItems) && result.awardedItems.length > 0 && (
        <div className="campaign-weekly-section">
          <strong>Seu resultado</strong>
          <div style={{ fontSize: 13, margin: '5px 0 8px' }}>Prêmio acumulado: {currency(result.totalPrize)}</div>
          {result.awardedItems.map(item => (
            <div key={item.name} className="campaign-weekly-row">
              <span>{item.name}</span>
              <span>{Number(item.boxes || 0)} caixas · {currency(item.sales)} · prêmio {currency(item.prize)}</span>
            </div>
          ))}
        </div>
      )}

      {result.industries && Object.keys(result.industries).length > 0 && (
        <div className="campaign-weekly-section">
          <strong>Suas vendas por indústria</strong>
          {Object.entries(result.industries)
            .sort(([nameA], [nameB]) => nameA.localeCompare(nameB, 'pt-BR', { sensitivity: 'base' }))
            .map(([name, item]) => (
              <div key={name} className="campaign-weekly-row">
                <span>{name}</span>
                <span>
                  {currency(item.sales)} · meta {Number(item.targetQuantity || 0)} clientes · realizado {Number(item.quantity || 0)}
                  {Number(item.targetQuantity) > 0
                    ? ` · ${((Number(item.quantity || 0) / Number(item.targetQuantity)) * 100).toFixed(1)}%`
                    : ''}
                </span>
              </div>
            ))}
        </div>
      )}

      {achievedIndustries.length > 0 && (
        <div className="campaign-weekly-achievements" aria-live="polite">
          {achievedIndustries.map(item => (
            <article key={item.name} className="campaign-weekly-achievement-card">
              <span className="campaign-weekly-achievement-icon" aria-hidden="true">🏆</span>
              <div>
                <strong>Parabéns! Requisitos mínimos cumpridos em {item.name}</strong>
                <p>Você é fera! Vendeu {currency(item.sales)} e atendeu {item.clients} clientes.</p>
                <small>
                  Mínimos: superar {currency(item.minimumSales)} em vendas e atingir {item.clientTarget} clientes.
                </small>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="campaign-weekly-footnote">
        O prêmio por caixas depende de a indústria atingir a meta geral da campanha.
      </p>
    </section>
  );
}
