import React, { useState, useEffect } from 'react';
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

  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', description: '', onConfirm: null });

  const [cupomCodigo, setCupomCodigo] = useState('');
  const [cupomLoading, setCupomLoading] = useState(false);
  const [cupomMsg, setCupomMsg] = useState(null); // { tipo: 'ok'|'err', texto: '' }

  const showConfirm = (title, description, onConfirm) =>
    setConfirmDialog({ open: true, title, description, onConfirm });
  const closeConfirm = () => setConfirmDialog(d => ({ ...d, open: false }));

  // ─── Busca a chave de licença no backend ──────────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;

    const buscarChave = async () => {
      try {
        setLoading(true);
        setErro('');
        const token = await auth.currentUser.getIdToken();
        const resp = await fetch(`${API_URL}/api/license/key/${user.uid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) throw new Error(`Erro ${resp.status}`);
        const data = await resp.json();
        setLicenseKey(data.license_key);
      } catch (e) {
        setErro('Não foi possível carregar sua chave. Tente recarregar a página.');
      } finally {
        setLoading(false);
      }
    };

    buscarChave();
  }, [user?.uid]);

  // ─── Copia a chave ────────────────────────────────────────────────────────
  const copiar = () => {
    if (!licenseKey) return;
    navigator.clipboard.writeText(licenseKey).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    });
  };

  // ─── Gera nova chave ──────────────────────────────────────────────────────
  const regenerar = () => {
    showConfirm(
      'Gerar nova chave',
      'Isso invalidará sua chave atual e o agente parará até você atualizar o arquivo agente.cfg.',
      async () => {
        try {
          setRegenerating(true);
          setErro('');
          const token = await auth.currentUser.getIdToken();
          const resp = await fetch(`${API_URL}/api/license/regenerate`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          });
          if (!resp.ok) throw new Error(`Erro ${resp.status}`);
          const data = await resp.json();
          setLicenseKey(data.license_key);
          toast.success('Nova chave gerada! Atualize o arquivo agente.cfg no seu computador.');
        } catch (e) {
          setErro('Erro ao gerar nova chave. Tente novamente.');
        } finally {
          setRegenerating(false);
        }
      }
    );
  };

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
      window.location.reload();
    } catch (e) {
      setCupomMsg({ tipo: 'err', texto: e.message });
    } finally {
      setCupomLoading(false);
    }
  };

  const handleLogout = () => {
    showConfirm('Sair', 'Deseja realmente sair?', () => { logout(); navigate('/login'); });
  };

  // ─── Status da assinatura ─────────────────────────────────────────────────
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

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.headerLeft}>
            <button onClick={() => navigate('/dashboard')} style={styles.btnBack}>← Dashboard</button>
            <span style={styles.logo}>🔑 Minha Licença</span>
          </div>
          <div style={styles.headerRight}>
            <span style={styles.userEmail}>{user?.email}</span>
            <button onClick={handleLogout} style={styles.btnLogout} title="Sair">🚪</button>
          </div>
        </div>
      </header>

      {/* Conteúdo */}
      <main style={styles.main}>

        {/* Card: Status da Assinatura */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Status da Assinatura</h2>
          <div style={{ ...styles.statusBadge, background: status.cor + '18', border: `1px solid ${status.cor}40` }}>
            <span style={{ fontSize: 24 }}>{status.icone}</span>
            <span style={{ ...styles.statusText, color: status.cor }}>{status.texto}</span>
          </div>
          {!assinaturaAtiva && (
            <button onClick={() => navigate('/plans')} style={styles.btnPlanos}>
              💎 Ver Planos e Assinar
            </button>
          )}
        </div>

        {/* Card: Cupom Promocional */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>🎟 Cupom Promocional</h2>
          <p style={styles.cardDesc}>Tem um cupom? Insira abaixo para ativar ou estender seu acesso.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Ex: TESTE-RCA-2026"
              value={cupomCodigo}
              onChange={e => setCupomCodigo(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && aplicarCupom()}
              disabled={cupomLoading}
              style={{
                flex: 1, minWidth: 180, padding: '11px 16px',
                background: '#2B2D31', border: '1px solid #4A4D52',
                borderRadius: 8, color: '#E1E1E1', fontSize: 15,
                fontFamily: 'monospace', letterSpacing: 1,
              }}
            />
            <button
              onClick={aplicarCupom}
              disabled={cupomLoading || !cupomCodigo.trim()}
              style={{ ...styles.btnPlanos, marginTop: 0, opacity: cupomLoading || !cupomCodigo.trim() ? 0.5 : 1 }}
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

        {/* Card: Chave de Licença */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Chave de Licença do Agente</h2>
          <p style={styles.cardDesc}>
            Copie esta chave e cole no arquivo <code style={styles.code}>agente.cfg</code> no seu computador.
          </p>

          {loading ? (
            <div style={styles.keyBox}>
              <span className="skeleton" style={{ flex: 1, height: 24, borderRadius: 6 }} />
              <span className="skeleton" style={{ width: 90, height: 38, borderRadius: 8 }} />
            </div>
          ) : erro ? (
            <div style={styles.erro}>{erro}</div>
          ) : (
            <>
              <div style={styles.keyBox}>
                <span style={styles.keyText}>{licenseKey}</span>
                <button onClick={copiar} style={{ ...styles.btnCopiar, background: copiado ? '#10b981' : '#3A85A8' }}>
                  {copiado ? '✅ Copiado!' : '📋 Copiar'}
                </button>
              </div>
              <button onClick={regenerar} disabled={regenerating} style={styles.btnRegenerar}>
                {regenerating ? '⏳ Gerando...' : '🔄 Gerar Nova Chave'}
              </button>
              <p style={styles.aviso}>
                ⚠️ Gerar uma nova chave invalida a anterior imediatamente.
              </p>
            </>
          )}
        </div>

        {/* Card: Como instalar o Agente */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Como instalar o Agente no seu PC</h2>
          <div style={styles.steps}>

            <div style={styles.step}>
              <div style={styles.stepNum}>1</div>
              <div>
                <strong>Instale o Python 3.11+</strong>
                <p style={styles.stepDesc}>Baixe em <a href="https://python.org" target="_blank" rel="noreferrer" style={styles.link}>python.org</a> e instale normalmente.</p>
              </div>
            </div>

            <div style={styles.step}>
              <div style={styles.stepNum}>2</div>
              <div>
                <strong>Baixe o Agente</strong>
                <p style={styles.stepDesc}>Baixe a pasta <code style={styles.code}>agente_local</code> do repositório e salve em qualquer lugar do seu PC.</p>
              </div>
            </div>

            <div style={styles.step}>
              <div style={styles.stepNum}>3</div>
              <div>
                <strong>Instale as dependências</strong>
                <p style={styles.stepDesc}>Abra o terminal na pasta do agente e execute:</p>
                <div style={styles.codeBlock}>
                  pip install playwright pandas requests<br />
                  playwright install chromium
                </div>
              </div>
            </div>

            <div style={styles.step}>
              <div style={styles.stepNum}>4</div>
              <div>
                <strong>Configure a chave de licença</strong>
                <p style={styles.stepDesc}>
                  Copie o arquivo <code style={styles.code}>agente.cfg.example</code>, renomeie para{' '}
                  <code style={styles.code}>agente.cfg</code> e cole sua chave:
                </p>
                <div style={styles.codeBlock}>
                  [licenca]<br />
                  chave = {licenseKey || 'SUA-CHAVE-AQUI'}<br />
                  servidor = https://api.representantes.app
                </div>
              </div>
            </div>

            <div style={styles.step}>
              <div style={styles.stepNum}>5</div>
              <div>
                <strong>Adicione seus contatos e fotos</strong>
                <p style={styles.stepDesc}>
                  Coloque seus contatos em <code style={styles.code}>contacts.csv</code> (colunas Nome e Telefone) e as fotos das ofertas na pasta <code style={styles.code}>fotos_ofertas/</code>.
                </p>
              </div>
            </div>

            <div style={styles.step}>
              <div style={styles.stepNum}>6</div>
              <div>
                <strong>Execute o agente</strong>
                <p style={styles.stepDesc}>No terminal, dentro da pasta:</p>
                <div style={styles.codeBlock}>python agente_local.py</div>
                <p style={styles.stepDesc}>
                  O navegador abrirá, escaneie o QR Code do WhatsApp e o agente começa a enviar automaticamente.
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Card: Como funciona o bloqueio */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Como funciona a proteção</h2>
          <div style={styles.infoGrid}>
            <div style={styles.infoItem}>
              <span style={styles.infoIcon}>🔒</span>
              <div>
                <strong>Validação na inicialização</strong>
                <p style={styles.infoDesc}>O agente verifica a licença toda vez que inicia. Se a assinatura estiver inativa, ele encerra imediatamente.</p>
              </div>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoIcon}>⏱️</span>
              <div>
                <strong>Revalidação a cada 1 hora</strong>
                <p style={styles.infoDesc}>Enquanto estiver rodando, o agente revalida a cada hora. Se a assinatura vencer, ele para sozinho.</p>
              </div>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoIcon}>🔄</span>
              <div>
                <strong>Renovação imediata</strong>
                <p style={styles.infoDesc}>Ao renovar a assinatura, o agente volta a funcionar na próxima validação sem precisar reinstalar.</p>
              </div>
            </div>
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

// ─── Estilos inline — tema Venpro dark ───────────────────────────────────────

const styles = {
  page: { minHeight: '100vh', background: '#2B2D31', fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif", color: '#E1E1E1' },
  header: { background: 'rgba(43,45,49,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #4A4D52', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 },
  headerContent: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 900, margin: '0 auto' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 16 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  btnBack: { background: 'none', border: '1px solid #4A4D52', borderRadius: 8, padding: '6px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#A0A3A8' },
  logo: { fontSize: 16, fontWeight: 700, color: '#ffffff' },
  userEmail: { fontSize: 13, color: '#6B6E74' },
  btnLogout: { background: 'none', border: '1px solid #4A4D52', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#A0A3A8' },
  main: { maxWidth: 900, margin: '32px auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 20 },
  card: { background: '#363940', border: '1px solid #4A4D52', borderRadius: 16, padding: 28 },
  cardTitle: { fontSize: 17, fontWeight: 700, color: '#ffffff', marginBottom: 14, marginTop: 0 },
  cardDesc: { fontSize: 14, color: '#A0A3A8', marginBottom: 20, lineHeight: 1.6 },
  statusBadge: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderRadius: 10, marginBottom: 16 },
  statusText: { fontSize: 15, fontWeight: 600 },
  btnPlanos: { background: '#3A85A8', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 4 },
  loading: { textAlign: 'center', padding: '24px', color: '#A0A3A8', fontSize: 15 },
  erro: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: 10, padding: '14px 18px', fontSize: 14 },
  keyBox: { display: 'flex', alignItems: 'center', gap: 12, background: '#2B2D31', border: '2px solid #4A4D52', borderRadius: 12, padding: '16px 20px', marginBottom: 12 },
  keyText: { flex: 1, fontFamily: 'monospace', fontSize: 20, fontWeight: 700, letterSpacing: 2, color: '#3A85A8' },
  btnCopiar: { color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'background 0.3s', whiteSpace: 'nowrap' },
  btnRegenerar: { background: 'none', border: '1px solid #4A4D52', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: '#A0A3A8', cursor: 'pointer', marginTop: 4 },
  aviso: { fontSize: 12, color: '#6B6E74', marginTop: 8 },
  code: { background: '#2B2D31', borderRadius: 4, padding: '2px 7px', fontFamily: 'monospace', fontSize: 12, color: '#3A85A8', border: '1px solid #4A4D52' },
  codeBlock: { background: '#1e2029', color: '#a8b4c8', borderRadius: 10, padding: '14px 18px', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.8, marginTop: 8, whiteSpace: 'pre', border: '1px solid #4A4D52' },
  steps: { display: 'flex', flexDirection: 'column', gap: 20 },
  step: { display: 'flex', gap: 16, alignItems: 'flex-start' },
  stepNum: { minWidth: 32, height: 32, borderRadius: '50%', background: '#3A85A8', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 },
  stepDesc: { fontSize: 13, color: '#A0A3A8', marginTop: 4, lineHeight: 1.6 },
  link: { color: '#3A85A8' },
  infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 20 },
  infoItem: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  infoIcon: { fontSize: 22 },
  infoDesc: { fontSize: 13, color: '#A0A3A8', marginTop: 4, lineHeight: 1.6 },
};

export default MinhaLicenca;
