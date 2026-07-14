import React, { useState } from 'react';
import { X, Target } from 'lucide-react';
import { toast } from 'sonner';
import './CreateCampaignModal.css';

// Tela do RCA para preencher AS PRÓPRIAS metas por indústria de uma campanha
// mestre. Não altera a mestre nem os dados de outros RCAs.
export default function MasterCampaignMetasModal({ campaign, onClose, onSave }) {
  const industrias = Object.keys(campaign?.industries || {});
  const [metas, setMetas] = useState(() => {
    const init = {};
    industrias.forEach(ind => { init[ind] = campaign?.metas?.[ind] ? String(campaign.metas[ind]).replace('.', ',') : ''; });
    return init;
  });
  const [saving, setSaving] = useState(false);

  const setMeta = (ind, v) => setMetas(prev => ({ ...prev, [ind]: v.replace(/[^\d,]/g, '') }));

  const handleSave = async () => {
    const parsed = {};
    industrias.forEach(ind => {
      const n = parseFloat((metas[ind] || '').replace(',', '.'));
      parsed[ind] = Number.isFinite(n) && n > 0 ? n : 0;
    });
    try {
      setSaving(true);
      await onSave(parsed);
      toast.success('✅ Metas salvas! Elas são só suas.');
      onClose();
    } catch (err) {
      toast.error('Erro ao salvar metas: ' + (err?.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  const contaProdutos = (ind) => Object.keys(campaign?.industries?.[ind] || {})
    .filter(k => !['targetValue', 'alreadySoldValue'].includes(k)).length;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="modal-content-campaign" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="campaign-modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Target size={18} /> Minhas metas — {campaign?.name}</h2>
          <button type="button" className="btn-close-campaign" onClick={onClose} aria-label="Fechar"><X size={20} strokeWidth={2.4} /></button>
        </div>

        <div className="campaign-modal-body">
          <p style={{ fontSize: 13.5, color: '#6b7280', marginBottom: 14 }}>
            A campanha e os produtos já vêm prontos. Informe a <strong>sua meta</strong> por indústria — fica salva só no seu login.
          </p>
          {industrias.length === 0 && <p className="admin-empty">Esta campanha ainda não tem indústrias.</p>}
          {industrias.map(ind => (
            <div className="campaign-form-group" key={ind}>
              <label>{ind} <small style={{ color: '#9ca3af' }}>· {contaProdutos(ind)} produto(s)</small></label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#6b7280', fontWeight: 700 }}>R$</span>
                <input type="text" inputMode="decimal" value={metas[ind]} onChange={e => setMeta(ind, e.target.value)} placeholder="0,00" style={{ flex: 1 }} />
              </div>
            </div>
          ))}
        </div>

        <div className="campaign-modal-footer">
          <button type="button" className="btn-cancel-campaign" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="btn-save-campaign" onClick={handleSave} disabled={saving || industrias.length === 0}>
            {saving ? 'Salvando...' : '💾 Salvar minhas metas'}
          </button>
        </div>
      </div>
    </div>
  );
}
