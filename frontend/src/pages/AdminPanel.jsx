import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Clipboard,
  Clock3,
  MessageCircle,
  PhoneCall,
  RefreshCw,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthContext } from '../contexts/AuthContext';
import api from '../services/api';
import { canAccessAdminPanel } from '../utils/adminAccess';
import './AdminPanel.css';

const DAY_OPTIONS = [4, 7, 30];

const FILTERS = {
  all: {
    label: 'Novos RCAs',
    title: 'Cadastros recentes',
    empty: 'Nenhum cadastro novo nessa janela.',
  },
  used: {
    label: 'Testaram a ferramenta',
    title: 'RCAs que testaram a ferramenta',
    empty: 'Nenhum RCA testou a ferramenta nesse filtro.',
  },
  noUsage: {
    label: 'Sem uso registrado',
    title: 'RCAs sem uso registrado',
    empty: 'Nenhum RCA sem uso registrado nesse filtro.',
  },
  needsContact: {
    label: 'Chamar conversa',
    title: 'RCAs para chamar',
    empty: 'Nenhum RCA marcado para conversa nesse filtro.',
  },
  expiringSoon: {
    label: 'Trial vence em 3 dias',
    title: 'Trials vencendo em ate 3 dias',
    empty: 'Nenhum trial vencendo em ate 3 dias nesse filtro.',
  },
};

const formatDateTime = (value) => {
  if (!value) return 'Sem registro';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem registro';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const daysUntil = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
};

const isTrialExpiringSoon = (item) => {
  const remaining = daysUntil(item.subscription?.trialEndsAt);
  return remaining !== null && remaining >= 0 && remaining <= 3;
};

const phoneDigits = (value) => String(value || '').replace(/\D/g, '');

const phoneDisplay = (value) => {
  const digits = phoneDigits(value);
  if (!digits) return '';
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  return String(value || '').trim();
};

const whatsappUrl = (value) => {
  const digits = phoneDigits(value);
  if (!digits) return '';
  const withCountry = digits.startsWith('55') || digits.length > 11 ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
};

const statusLabel = (subscription) => {
  if (!subscription) return { label: 'Sem assinatura', tone: 'neutral' };
  if (subscription.status === 'trialing') {
    const remainingDays = daysUntil(subscription.trialEndsAt);
    if (remainingDays === null) return { label: 'Trial sem data', tone: 'warn' };
    if (remainingDays < 0) return { label: 'Trial vencido', tone: 'danger' };
    return { label: 'Trial ativo', tone: 'ok' };
  }
  if (subscription.status === 'active') return { label: 'Assinante ativo', tone: 'ok' };
  if (subscription.status === 'pending') return { label: 'Pendente', tone: 'warn' };
  if (subscription.status === 'trial_expired') return { label: 'Trial expirado', tone: 'danger' };
  if (subscription.status === 'canceled') return { label: 'Cancelado', tone: 'danger' };
  return { label: subscription.status || 'Indefinido', tone: 'neutral' };
};

const summarizeActivity = (activity) => {
  if (!activity?.hasToolUsage) return 'Sem uso registrado';
  const cotacaoReady = activity.cotacaoReadyCount || 0;
  const jobs = activity.uniqueCotatudoJobs || 0;
  const events = activity.auditEventCount || 0;
  if (cotacaoReady && jobs) return `${cotacaoReady} cotação${cotacaoReady === 1 ? '' : 'ões'} processada${cotacaoReady === 1 ? '' : 's'} + ${jobs} job${jobs === 1 ? '' : 's'} Cotatudo`;
  if (cotacaoReady) return `${cotacaoReady} cotação${cotacaoReady === 1 ? '' : 'ões'} processada${cotacaoReady === 1 ? '' : 's'}`;
  if (jobs) return `${jobs} job${jobs === 1 ? '' : 's'} de cotação`;
  if (events) return `${events} evento${events === 1 ? '' : 's'} registrado${events === 1 ? '' : 's'}`;
  return 'Sessão registrada';
};

const AdminMetric = ({ icon: Icon, label, value, active, onClick }) => (
  <button
    type="button"
    className={`admin-metric${active ? ' active' : ''}`}
    onClick={onClick}
    aria-pressed={active}
  >
    <div className="admin-metric-icon"><Icon size={18} /></div>
    <div>
      <div className="admin-metric-value">{value}</div>
      <div className="admin-metric-label">{label}</div>
    </div>
  </button>
);

const AdminPanel = () => {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [days, setDays] = useState(4);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  const canViewAdmin = canAccessAdminPanel(user);

  const loadReport = useCallback(async () => {
    if (!canViewAdmin) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/admin/recent-users', { params: { days, limit: 25 } });
      setReport(response.data);
    } catch (err) {
      const message = err?.response?.data?.detail || 'Não foi possível carregar o painel admin.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [canViewAdmin, days]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const totals = report?.totals || {};
  const users = report?.users || [];

  const expiringSoon = useMemo(() => users.filter(isTrialExpiringSoon).length, [users]);
  const filteredUsers = useMemo(() => {
    if (activeFilter === 'used') {
      return users.filter((item) => item.activity?.hasToolUsage);
    }
    if (activeFilter === 'noUsage') {
      return users.filter((item) => !item.activity?.hasToolUsage);
    }
    if (activeFilter === 'needsContact') {
      return users.filter((item) => item.followUp?.shouldContact);
    }
    if (activeFilter === 'expiringSoon') {
      return users.filter(isTrialExpiringSoon);
    }
    return users;
  }, [activeFilter, users]);
  const activeFilterInfo = FILTERS[activeFilter] || FILTERS.all;
  const metricItems = [
    { key: 'all', icon: Users, label: FILTERS.all.label, value: totals.recentUsers ?? users.length },
    { key: 'used', icon: Activity, label: FILTERS.used.label, value: totals.usedTool ?? 0 },
    { key: 'noUsage', icon: Clock3, label: FILTERS.noUsage.label, value: totals.noUsage ?? 0 },
    { key: 'needsContact', icon: MessageCircle, label: FILTERS.needsContact.label, value: totals.needsContact ?? 0 },
    { key: 'expiringSoon', icon: AlertTriangle, label: FILTERS.expiringSoon.label, value: expiringSoon },
  ];

  const copyUid = async (uid) => {
    try {
      await navigator.clipboard.writeText(uid);
      toast.success('UID copiado.');
    } catch {
      toast.warning('Não foi possível copiar o UID.');
    }
  };

  if (!canViewAdmin) {
    return (
      <div className="admin-page">
        <main className="admin-denied">
          <ShieldCheck size={36} />
          <h1>Acesso restrito</h1>
          <p>Este painel só está disponível para usuários com `role: admin`.</p>
          <button type="button" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={16} /> Voltar ao dashboard
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="admin-header-left">
            <button type="button" className="admin-icon-button" onClick={() => navigate('/dashboard')} title="Voltar">
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="admin-kicker"><ShieldCheck size={15} /> Admin</div>
              <h1>Painel operacional</h1>
            </div>
          </div>
          <div className="admin-header-actions">
            <div className="admin-range" aria-label="Janela de cadastros">
              {DAY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={days === option ? 'active' : ''}
                  onClick={() => setDays(option)}
                >
                  {option} dias
                </button>
              ))}
            </div>
            <button type="button" className="admin-refresh" onClick={loadReport} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'spinning' : ''} /> Atualizar
            </button>
          </div>
        </div>
      </header>

      <main className="admin-main">
        <section className="admin-metrics-grid">
          {metricItems.map((metric) => (
            <AdminMetric
              key={metric.key}
              icon={metric.icon}
              label={metric.label}
              value={metric.value}
              active={activeFilter === metric.key}
              onClick={() => setActiveFilter(metric.key)}
            />
          ))}
        </section>

        {error && (
          <div className="admin-alert">
            <AlertTriangle size={17} /> {error}
          </div>
        )}

        <section className="admin-list-section">
          <div className="admin-section-header">
            <div>
              <h2>{activeFilterInfo.title}</h2>
              <p>{report?.window?.since ? `Desde ${formatDateTime(report.window.since)}` : 'Carregando janela de consulta'}</p>
            </div>
            <div className="admin-section-actions">
              <span>
                {loading
                  ? 'Carregando...'
                  : `${filteredUsers.length} de ${users.length} registro${users.length === 1 ? '' : 's'}`}
              </span>
              {activeFilter !== 'all' && (
                <button type="button" className="admin-clear-filter" onClick={() => setActiveFilter('all')}>
                  <X size={14} /> Limpar
                </button>
              )}
            </div>
          </div>

          {!loading && filteredUsers.length === 0 && (
            <div className="admin-empty">{users.length === 0 ? FILTERS.all.empty : activeFilterInfo.empty}</div>
          )}

          <div className="admin-user-list">
            {filteredUsers.map((item) => {
              const status = statusLabel(item.subscription);
              const remainingDays = daysUntil(item.subscription?.trialEndsAt);
              const lastSession = item.activity?.lastSeenAt;
              const followUp = item.followUp || {};
              const phone = phoneDisplay(item.phone);
              const digits = phoneDigits(item.phone);
              const waUrl = whatsappUrl(item.phone);

              return (
                <article className="admin-user-row" key={item.uid}>
                  <div className="admin-user-main">
                    <div>
                      <h3>{item.name || 'Sem nome'}</h3>
                      <p>{item.email || 'Sem email'}</p>
                      <div className="admin-contact-row">
                        {phone ? (
                          <>
                            <span className="admin-phone-text">{phone}</span>
                            <a className="admin-contact-link" href={`tel:${digits}`}>
                              <PhoneCall size={14} /> Ligar
                            </a>
                            <a className="admin-contact-link" href={waUrl} target="_blank" rel="noreferrer">
                              <MessageCircle size={14} /> WhatsApp
                            </a>
                          </>
                        ) : (
                          <span className="admin-phone-empty">Sem telefone no cadastro</span>
                        )}
                      </div>
                    </div>
                    <button type="button" className="admin-copy" onClick={() => copyUid(item.uid)} title="Copiar UID">
                      <Clipboard size={15} /> UID
                    </button>
                  </div>

                  <div className="admin-user-grid">
                    <div>
                      <span>Cadastro</span>
                      <strong>{formatDateTime(item.createdAt)}</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong className={`admin-status ${status.tone}`}>{status.label}</strong>
                    </div>
                    <div>
                      <span>Fim do trial</span>
                      <strong>
                        {formatDateTime(item.subscription?.trialEndsAt)}
                        {remainingDays !== null && remainingDays >= 0 ? ` (${remainingDays}d)` : ''}
                      </strong>
                    </div>
                    <div>
                      <span>Última sessão</span>
                      <strong>{formatDateTime(lastSession)}</strong>
                    </div>
                    <div>
                      <span>Última ferramenta</span>
                      <strong>{formatDateTime(followUp.lastToolUseAt || item.activity?.lastToolUseAt)}</strong>
                    </div>
                    <div>
                      <span>Acompanhamento</span>
                      <strong className={`admin-status ${followUp.tone || 'neutral'}`}>
                        {followUp.label || 'Sem sinal'}
                      </strong>
                    </div>
                  </div>

                  <div className="admin-activity-line">
                    <span>{summarizeActivity(item.activity)}</span>
                    <span>{item.activity?.deviceCount || 0} dispositivo{item.activity?.deviceCount === 1 ? '' : 's'}</span>
                    <span>{item.activity?.loginCount || 0} sessão{item.activity?.loginCount === 1 ? '' : 'ões'}</span>
                    {followUp.shouldContact && <span className="admin-contact-badge">{followUp.reason}</span>}
                  </div>

                  {item.activity?.recentCotatudoJobs?.length > 0 && (
                    <div className="admin-job-list">
                      {item.activity.recentCotatudoJobs.slice(0, 3).map((job) => (
                        <div className="admin-job" key={job.jobId || `${job.createdAt}-${job.prazo}`}>
                          <span>{job.site || 'site'} · {job.modo || 'modo'} · {job.prazo || '-'} dias</span>
                          <strong>{job.preenchidos ?? 0}/{job.totalItens ?? 0} preenchidos</strong>
                          <em>{job.naoEncontrados ?? 0} não encontrados</em>
                        </div>
                      ))}
                    </div>
                  )}

                  {item.activity?.recentCotacaoReadyJobs?.length > 0 && (
                    <div className="admin-job-list">
                      {item.activity.recentCotacaoReadyJobs.slice(0, 3).map((job) => (
                        <div className="admin-job" key={job.sessionId || job.jobId || `${job.createdAt}-${job.prazo}`}>
                          <span>Cotação Pronta · {job.modo || 'modo'} · {job.prazo || '-'} dias</span>
                          <strong>{job.preenchidos ?? 0}/{job.totalItens ?? 0} preenchidos</strong>
                          <em>{job.semMatch ?? 0} sem match</em>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
};

export default AdminPanel;
