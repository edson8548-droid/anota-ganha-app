import React, { useState } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { campaignsService } from '../services/campaigns.service';

const currency = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number(value) || 0);

export default function CampaignWeeklyResults({ campaign, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [rcaCode, setRcaCode] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const [preview, setPreview] = useState(null);
  if (!campaign?.isShared || !campaign?.masterId) return null;

  const summary = campaign.weeklySummary || {};
  const result = campaign.rcaResult || {};
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
    <section style={{ marginTop: 18, padding: 16, border: '1px solid #fed7aa', borderRadius: 14, background: '#fffaf3' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <strong>🏆 Itens Premiados</strong>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
            Código RCA: {campaign.rcaCode || 'não vinculado'}
            {(summary.periodEnd || result.periodEnd) ? ` · apuração até ${new Date(`${summary.periodEnd || result.periodEnd}T12:00:00`).toLocaleDateString('pt-BR')}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {!campaign.rcaCode && (
            <input
              type="text"
              inputMode="numeric"
              value={rcaCode}
              onChange={(event) => setRcaCode(event.target.value.replace(/\D/g, ''))}
              placeholder="Seu código RCA (ex.: 614)"
              aria-label="Seu código RCA"
              disabled={uploading || !!preview}
              style={{ minWidth: 190, padding: '9px 10px', border: '1px solid #fdba74', borderRadius: 8 }}
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

      {preview?.requiresConfirmation && (
        <div style={{ marginTop: 14, padding: 12, border: '1px solid #fb923c', borderRadius: 10, background: '#fff' }}>
          <strong>Confirme seu código antes de vincular</strong>
          <p style={{ margin: '6px 0', fontSize: 13 }}>
            Código {preview.profile?.code} · {preview.profile?.name || 'Nome não informado'}
            {preview.periodEnd ? ` · apuração até ${new Date(`${preview.periodEnd}T12:00:00`).toLocaleDateString('pt-BR')}` : ''}
          </p>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: '#92400e' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginTop: 14 }}>
          {summary.suppliers.map(item => (
            <div key={item.name} style={{ padding: 12, borderRadius: 10, background: '#fff', border: '1px solid #ffedd5' }}>
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
        <div style={{ marginTop: 14 }}>
          <strong>Produtos e prêmio por caixa</strong>
          {prizeRules.map(item => (
            <div key={`${item.industryName}:${item.productName}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderTop: '1px solid #ffedd5', fontSize: 13 }}>
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
        <div style={{ marginTop: 14 }}>
          <strong>Seu resultado</strong>
          <div style={{ fontSize: 13, margin: '5px 0 8px' }}>Prêmio acumulado: {currency(result.totalPrize)}</div>
          {result.awardedItems.map(item => (
            <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderTop: '1px solid #ffedd5', fontSize: 13 }}>
              <span>{item.name}</span>
              <span>{Number(item.boxes || 0)} caixas · {currency(item.sales)} · prêmio {currency(item.prize)}</span>
            </div>
          ))}
        </div>
      )}

      {result.industries && Object.keys(result.industries).length > 0 && (
        <div style={{ marginTop: 14 }}>
          <strong>Suas vendas por indústria</strong>
          {Object.entries(result.industries)
            .sort(([nameA], [nameB]) => nameA.localeCompare(nameB, 'pt-BR', { sensitivity: 'base' }))
            .map(([name, item]) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderTop: '1px solid #ffedd5', fontSize: 13 }}>
                <span>{name}</span>
                <span>{currency(item.sales)} · {Number(item.quantity || 0)} clientes atendidos</span>
              </div>
            ))}
        </div>
      )}

      <p style={{ fontSize: 12, color: '#92400e', margin: '12px 0 0' }}>
        O prêmio por caixas depende de a indústria atingir a meta geral da campanha.
      </p>
    </section>
  );
}
