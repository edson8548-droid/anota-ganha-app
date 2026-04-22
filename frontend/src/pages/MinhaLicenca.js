import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { auth } from '../firebase/config';

const API_URL = 'https://anota-ganha-backend.onrender.com';

const MinhaLicenca = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthContext();
  const { subscription, currentPlan, isTrialActive, trialEndsAt } = useSubscription();

  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState('');

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
  const regenerar = async () => {
    if (!window.confirm('Isso invalidará sua chave atual e o agente parará até você atualizar o arquivo agente.cfg. Continuar?')) return;
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
      alert('Nova chave gerada! Atualize o arquivo agente.cfg no seu computador.');
    } catch (e) {
      setErro('Erro ao gerar nova chave. Tente novamente.');
    } finally {
      setRegenerating(false);
    }
  };

  const handleLogout = () => {
    if (window.confirm('Deseja sair?')) { logout(); navigate('/login'); }
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

        {/* Card: Chave de Licença */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Chave de Licença do Agente</h2>
          <p style={styles.cardDesc}>
            Copie esta chave e cole no arquivo <code style={styles.code}>agente.cfg</code> no seu computador.
          </p>

          {loading ? (
            <div style={styles.loading}>⏳ Carregando sua chave...</div>
          ) : erro ? (
            <div style={styles.erro}>{erro}</div>
          ) : (
            <>
              <div style={styles.keyBox}>
                <span style={styles.keyText}>{licenseKey}</span>
                <button onClick={copiar} style={{ ...styles.btnCopiar, background: copiado ? '#10b981' : '#667eea' }}>
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
        <div style={{ ...styles.card, background: '#fafafa' }}>
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
    </div>
  );
};

// ─── Estilos inline (mesmo padrão do projeto) ─────────────────────────────────

const styles = {
  page: { minHeight: '100vh', background: '#f3f4f6', fontFamily: 'Arial, sans-serif' },
  header: { background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center' },
  headerContent: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 900, margin: '0 auto' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 16 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  btnBack: { background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 14, color: '#374151' },
  logo: { fontSize: 18, fontWeight: 700, color: '#1f2937' },
  userEmail: { fontSize: 13, color: '#6b7280' },
  btnLogout: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 },
  main: { maxWidth: 900, margin: '32px auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 24 },
  card: { background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  cardTitle: { fontSize: 18, fontWeight: 700, color: '#1f2937', marginBottom: 16, marginTop: 0 },
  cardDesc: { fontSize: 14, color: '#6b7280', marginBottom: 20, lineHeight: 1.6 },
  statusBadge: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderRadius: 10, marginBottom: 16 },
  statusText: { fontSize: 16, fontWeight: 600 },
  btnPlanos: { background: 'linear-gradient(135deg,#667eea,#764ba2)', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
  loading: { textAlign: 'center', padding: '24px', color: '#6b7280', fontSize: 15 },
  erro: { background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 8, padding: '14px 18px', fontSize: 14 },
  keyBox: { display: 'flex', alignItems: 'center', gap: 12, background: '#f9fafb', border: '2px solid #e5e7eb', borderRadius: 10, padding: '16px 20px', marginBottom: 12 },
  keyText: { flex: 1, fontFamily: 'monospace', fontSize: 22, fontWeight: 700, letterSpacing: 2, color: '#1f2937' },
  btnCopiar: { color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'background 0.3s', whiteSpace: 'nowrap' },
  btnRegenerar: { background: 'none', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: '#6b7280', cursor: 'pointer', marginTop: 4 },
  aviso: { fontSize: 12, color: '#9ca3af', marginTop: 8 },
  code: { background: '#f3f4f6', borderRadius: 4, padding: '2px 6px', fontFamily: 'monospace', fontSize: 13, color: '#374151' },
  codeBlock: { background: '#1f2937', color: '#e5e7eb', borderRadius: 8, padding: '14px 18px', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.8, marginTop: 8, whiteSpace: 'pre' },
  steps: { display: 'flex', flexDirection: 'column', gap: 20 },
  step: { display: 'flex', gap: 16, alignItems: 'flex-start' },
  stepNum: { minWidth: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#667eea,#764ba2)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15 },
  stepDesc: { fontSize: 13, color: '#6b7280', marginTop: 4, lineHeight: 1.6 },
  link: { color: '#667eea' },
  infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 20 },
  infoItem: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  infoIcon: { fontSize: 24 },
  infoDesc: { fontSize: 13, color: '#6b7280', marginTop: 4, lineHeight: 1.6 },
};

export default MinhaLicenca;
