import React, { useState } from 'react';
import { X, Lock } from 'lucide-react';

/**
 * Modal simples para digitar uma senha/código de campanha compartilhada.
 * onConfirm(code) — chamado ao confirmar; onClose() — fecha sem ação.
 */
export default function CodePromptModal({
  title = 'Digite o código',
  description = '',
  confirmLabel = 'Confirmar',
  placeholder = 'Código da campanha',
  loading = false,
  onConfirm,
  onClose,
}) {
  const [code, setCode] = useState('');

  const submit = () => {
    const v = code.trim();
    if (!v || loading) return;
    onConfirm(v);
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
      style={{ zIndex: 10000 }}
    >
      <div
        className="modal-content-campaign"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 420 }}
      >
        <div className="campaign-modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lock size={18} /> {title}
          </h2>
          <button type="button" className="btn-close-campaign" onClick={onClose} aria-label="Fechar" disabled={loading}>
            <X size={20} strokeWidth={2.4} />
          </button>
        </div>

        <div className="campaign-modal-body">
          {description && (
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 14 }}>{description}</p>
          )}
          <div className="campaign-form-group">
            <input
              type="text"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={placeholder}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
              disabled={loading}
            />
          </div>
        </div>

        <div className="campaign-modal-footer">
          <button type="button" className="btn-cancel-campaign" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button type="button" className="btn-save-campaign" onClick={submit} disabled={loading || !code.trim()}>
            {loading ? 'Aguarde...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
