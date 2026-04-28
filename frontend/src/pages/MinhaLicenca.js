import React, { useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { auth } from '../firebase/config';
import ConfirmDialog from '../components/ConfirmDialog';

const API_URL = 'https://api.venpro.com.br';

const MinhaLicenca = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthContext();
  const { subscription, currentPlan, isTrialActive, trialEndsAt } = useSubscription();

  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', description: '', onConfirm: null });
  const [cupomCodigo, setCupomCodigo] = useState('');
  const [cupomLoading, setCupomLoading] = useState(false);
  const [cupomMsg, setCupomMsg] = useState(null);

  const showConfirm = (title, description, onConfirm) =>
    setConfirmDialog({ open: true, title, description, onConfirm });
  const closeConfirm = () => setConfirmDialog(d => ({ ...d, open: false }));

  const aplicarCupom = async () => {
    if (!cupomCodigo.trim()) return;
    setCupomLoading(true);
    setCupomMsg(null);
    try {
      const token = await auth.currentUser.getIdToken();
      const resp = await fetch(`${API_URL}/api/license/apply-coupon`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ coupon_code: cupomCodigo.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Erro ao aplicar cupom');
      setCupomMsg({ tipo: 'ok', texto: data.message || 'Cupom aplicado! Seu acesso foi estendido.' });
      setCupomCodigo('');
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setCupomMsg({ tipo: 'err', texto: e.message });
    } finally {
      setCupomLoading(false);
    }
  };

  const handleLogout = () => {
    showConfirm('Sair', 'Deseja realmente sair?', () => { logout(); navigate('/login'); });
  };

  const statusInfo = () => {
    const s = subscription?.status;
    if (s === 'active')        return { cor: '#10b981', icone: '✅', texto: `Ativa — Plano ${currentPlan?.name || ''}` };
    if (s === 'trialing')      return { cor: '#f59e0b', icone: '🎁', texto: `Trial — ${trialEndsAt ? `até ${trialEndsAt.toLocaleDateString('pt-BR')}` : ''}` };
    if (s === 'trial_expired') return { cor: '#ef4444', icone: '⏰', texto: 'Trial expirado' };
    if (s === 'canceled')      return { cor: '#ef4444', icone: '❌', texto: 'Cancelada' };
    return { cor: '#6b7280', icone: '⚠️', texto: 'Sem assinatura' };
  };

  const status = statusInfo();
  const assinaturaAtiva = subscription?.status === 'active' || isTrialActive;

  return (
    <div style={s.page}>

      {/* Header */}
      <header style={s.header}>
        <div style={s.headerContent}>
          <div style={s.headerLeft}>
            <button onClick={() => navigate('/dashboard')} style={s.btnBack}>← Dashboard</button>
            <span style={s.logo}>Minha Licença</span>
          </div>
          <div style={s.headerRight}>
            <span style={s.userEmail}>{user?.email}</span>
            <button onClick={handleLogout} style={s.btnLogout}>Sair</button>
          </div>
        </div>
      </header>

      <main style={s.main}>

        {/* Status */}
        <div style={s.card}>
          <div style={s.cardHeader}>
            <h2 style={s.cardTitle}>Assinatura</h2>
          </div>
          <div style={{ ...s.statusBadge, background: status.cor + '18', border: `1px solid ${status.cor}40` }}>
            <span style={{ fontSize: 22 }}>{status.icone}</span>
            <span style={{ ...s.statusText, color: status.cor }}>{status.texto}</span>
          </div>
          {!assinaturaAtiva && (
            <button onClick={() => navigate('/plans')} style={s.btnPrimary}>
              Ver planos e assinar
            </button>
          )}
        </div>

        {/* Cupom */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>Cupom promocional</h2>
          <p style={s.cardDesc}>Insira seu cupom para ativar ou estender o acesso.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Ex: TESTE-RCA-2026"
              value={cupomCodigo}
              onChange={e => setCupomCodigo(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && aplicarCupom()}
              disabled={cupomLoading}
              style={s.cupomInput}
            />
            <button
              onClick={aplicarCupom}
              disabled={cupomLoading || !cupomCodigo.trim()}
              style={{ ...s.btnPrimary, opacity: cupomLoading || !cupomCodigo.trim() ? 0.5 : 1 }}
            >
              {cupomLoading ? 'Aplicando...' : 'Aplicar'}
            </button>
          </div>
          {cupomMsg && (
            <div style={{
              marginTop: 12, padding: '10px 16px', borderRadius: 8, fontSize: 14,
              background: cupomMsg.tipo === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${cupomMsg.tipo === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: cupomMsg.tipo === 'ok' ? '#10b981' : '#f87171',
            }}>
              {cupomMsg.tipo === 'ok' ? '✅ ' : '❌ '}{cupomMsg.texto}
            </div>
          )}
        </div>

        {/* Extensões */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>Extensões Chrome</h2>
          <p style={s.cardDesc}>Instale as extensões no Chrome para usar as ferramentas Venpro.</p>

          <div style={s.extGrid}>

            <div style={s.extCard}>
              <div style={s.extIcon}>🧩</div>
              <div style={{ flex: 1 }}>
                <div style={s.extName}>Cotatudo Automático</div>
                <div style={s.extDesc}>Preenche cotações no Cotatudo automaticamente com os preços da sua tabela.</div>
              </div>
              <a href="/venpro-cotatudo-extension.zip" download style={s.btnDownload}>
                Baixar
              </a>
            </div>

            <div style={s.extCard}>
              <div style={s.extIcon}>💬</div>
              <div style={{ flex: 1 }}>
                <div style={s.extName}>Campanhas WhatsApp</div>
                <div style={s.extDesc}>Dispara ofertas para sua carteira de clientes via WhatsApp Web.</div>
              </div>
              <a href="/venpro-whatsapp-extension.zip" download style={s.btnDownload}>
                Baixar
              </a>
            </div>

          </div>

          <div style={s.installHint}>
            <strong>Como instalar:</strong> Baixe o ZIP → extraia → abra <code style={s.code}>chrome://extensions</code> no Chrome → ative <em>Modo do desenvolvedor</em> → clique <em>Carregar sem compactação</em> → selecione a pasta que contém o arquivo <code style={s.code}>manifest.json</code>.
          </div>
        </div>

      </main>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={() => { confirmDialog.onConfirm?.(); closeConfirm(); }}
        onCancel={closeConfirm}
      />
    </div>
  );
};

const s = {
  page: { minHeight: '100vh', background: '#2B2D31', fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif", color: '#E1E1E1' },
  header: { background: 'rgba(43,45,49,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #4A4D52', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 },
  headerContent: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 720, margin: '0 auto' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 16 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  btnBack: { background: 'none', border: '1px solid #4A4D52', borderRadius: 8, padding: '6px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#A0A3A8' },
  logo: { fontSize: 15, fontWeight: 700, color: '#ffffff' },
  userEmail: { fontSize: 13, color: '#6B6E74' },
  btnLogout: { background: 'none', border: '1px solid #4A4D52', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: '#A0A3A8' },
  main: { maxWidth: 720, margin: '32px auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 16 },
  card: { background: '#363940', border: '1px solid #4A4D52', borderRadius: 14, padding: 24 },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: '#ffffff', margin: '0 0 14px 0' },
  cardDesc: { fontSize: 13, color: '#A0A3A8', marginBottom: 16, lineHeight: 1.6, marginTop: -6 },
  statusBadge: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 10, marginBottom: 14 },
  statusText: { fontSize: 14, fontWeight: 600 },
  btnPrimary: { background: '#3A85A8', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  cupomInput: { flex: 1, minWidth: 180, padding: '10px 16px', background: '#2B2D31', border: '1px solid #4A4D52', borderRadius: 8, color: '#E1E1E1', fontSize: 14, fontFamily: 'monospace', letterSpacing: 1 },
  extGrid: { display: 'flex', flexDirection: 'column', gap: 12 },
  extCard: { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: '#2B2D31', borderRadius: 10, border: '1px solid #4A4D52' },
  extIcon: { fontSize: 24, flexShrink: 0 },
  extName: { fontSize: 14, fontWeight: 600, color: '#E1E1E1', marginBottom: 3 },
  extDesc: { fontSize: 12, color: '#A0A3A8', lineHeight: 1.5 },
  btnDownload: { background: '#3A85A8', color: '#fff', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 },
  installHint: { marginTop: 16, padding: '12px 16px', background: '#2B2D31', borderRadius: 8, fontSize: 12, color: '#A0A3A8', lineHeight: 1.7, borderLeft: '3px solid #3A85A8' },
  code: { background: '#363940', borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace', fontSize: 11, color: '#3A85A8', border: '1px solid #4A4D52' },
};

export default MinhaLicenca;
