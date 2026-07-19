import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Clipboard,
  Clock3,
  MessageCircle,
  PhoneCall,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthContext } from '../contexts/AuthContext';
import api from '../services/api';
import { backendUrl } from '../config/api';
import { canAccessAdminPanel } from '../utils/adminAccess';
import MasterCampaignsAdmin from '../components/MasterCampaignsAdmin';
import './AdminPanel.css';

const DAY_OPTIONS = [4, 7, 30];

const FILTERS = {
  allRegistered: {
    label: 'RCAs cadastrados',
    title: 'Todos os RCAs cadastrados',
    empty: 'Nenhum RCA cadastrado encontrado.',
  },
  newUsers: {
    label: 'Novos no período',
    title: 'Cadastros recentes',
    empty: 'Nenhum cadastro novo nessa janela.',
  },
  suspiciousUsers: {
    label: 'Cadastros suspeitos',
    title: 'Possíveis cadastros duplicados',
    empty: 'Nenhum cadastro suspeito encontrado.',
  },
  used: {
    label: 'Testaram a ferramenta',
    title: 'RCAs que testaram a ferramenta',
    empty: 'Nenhum RCA testou a ferramenta nesse filtro.',
  },
  activeToday: {
    label: 'Usaram hoje',
    title: 'RCAs com uso hoje',
    empty: 'Nenhum uso registrado hoje.',
  },
  activeLast7Days: {
    label: 'Usaram 7 dias',
    title: 'RCAs ativos nos últimos 7 dias',
    empty: 'Nenhum uso registrado nos últimos 7 dias.',
  },
  stoppedUsing: {
    label: 'Pararam de usar',
    title: 'RCAs que usaram e pararam',
    empty: 'Nenhum RCA parado nesse filtro.',
  },
  needsContact: {
    label: 'Chamar conversa',
    title: 'RCAs para chamar',
    empty: 'Nenhum RCA marcado para conversa nesse filtro.',
  },
  neverUsed: {
    label: 'Nunca usaram',
    title: 'RCAs que ainda não usaram',
    empty: 'Nenhum RCA sem uso registrado nesse filtro.',
  },
  expiringSoon: {
    label: 'Trial vence em 7 dias',
    title: 'Trials vencendo em ate 7 dias',
    empty: 'Nenhum trial vencendo em ate 7 dias nesse filtro.',
  },
  payingInactive: {
    label: 'Pagando sem usar',
    title: 'Assinantes ativos sem uso ha 5+ dias (risco de cancelamento)',
    empty: 'Nenhum assinante ativo parado. Otimo sinal!',
  },
};

const WEBHOOK_ALERT_LABELS = {
  asaas_webhook_unmapped: 'Pagamento recebido sem usuário mapeado — verificar no Asaas',
  asaas_webhook_invalid_token: 'Webhook com token inválido — possível tentativa de fraude',
  asaas_webhook_token_missing: 'Webhook sem token configurado no servidor',
};

const PAYMENT_ISSUE_LABELS = {
  PAYMENT_OVERDUE: 'Pagamento vencido',
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'Cartão recusado',
};

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number(value) || 0);

// Datas de vencimento vêm sem horário (ex.: 2026-07-10T00:00:00Z);
// formatar em UTC evita mostrar o dia anterior no fuso de Brasília.
const formatDateOnly = (value) => {
  if (!value) return 'Sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
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

const TRIAL_EXPIRING_WINDOW_DAYS = 7;
const PAYING_INACTIVE_DAYS = 5;

const isTrialExpiringSoon = (item) => {
  const remaining = daysUntil(item.subscription?.trialEndsAt);
  return remaining !== null && remaining >= 0 && remaining <= TRIAL_EXPIRING_WINDOW_DAYS;
};

// Assinante ativo que não usa a ferramenta há dias = cancelamento em gestação.
const isPayingInactive = (item) => {
  if (item.subscription?.status !== 'active') return false;
  const lastUse = item.followUp?.lastToolUseAt
    || item.activity?.lastToolUseAt
    || item.activity?.lastSeenAt;
  if (!lastUse) return true;
  const lastDate = new Date(lastUse);
  if (Number.isNaN(lastDate.getTime())) return true;
  return Date.now() - lastDate.getTime() > PAYING_INACTIVE_DAYS * 86400000;
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
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState('allRegistered');
  const [trialSearch, setTrialSearch] = useState('');
  const [trialResults, setTrialResults] = useState(null);
  const [trialLoading, setTrialLoading] = useState(false);
  const [trialGranting, setTrialGranting] = useState('');
  const [health, setHealth] = useState(null);

  const canViewAdmin = canAccessAdminPanel(user);

  useEffect(() => {
    if (!canViewAdmin) return;
    fetch(backendUrl('/health'))
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setHealth({ status: 'unreachable' }));
  }, [canViewAdmin]);

  const loadReport = useCallback(async () => {
    if (!canViewAdmin) return;
    setLoading(true);
    setError('');
    const [reportResult, billingResult] = await Promise.allSettled([
      api.get('/admin/recent-users', { params: { days, limit: 200 } }),
      api.get('/admin/billing-overview', { params: { days: 7 } }),
    ]);
    if (reportResult.status === 'fulfilled') {
      setReport(reportResult.value.data);
    } else {
      const message = reportResult.reason?.response?.data?.detail || 'Não foi possível carregar o painel admin.';
      setError(message);
    }
    if (billingResult.status === 'fulfilled') {
      setBilling(billingResult.value.data);
    }
    setLoading(false);
  }, [canViewAdmin, days]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const totals = report?.totals || {};
  const segments = report?.segments || {};
  const users = segments.allRegistered || report?.users || [];

  const expiringSoon = useMemo(() => users.filter(isTrialExpiringSoon).length, [users]);
  const payingInactive = useMemo(() => users.filter(isPayingInactive).length, [users]);

  const healthBadge = useMemo(() => {
    if (!health) return null;
    if (health.status === 'unreachable') return { ok: false, label: 'API fora do ar' };
    const issues = [];
    if (health.database !== 'connected') issues.push('Mongo');
    if (health.firestore && health.firestore !== 'connected') issues.push('Firestore');
    if (health.auth_directory && health.auth_directory !== 'connected') issues.push('Login');
    if (health.status !== 'healthy') issues.push('API');
    if (issues.length === 0) return { ok: true, label: 'Sistemas ok' };
    return { ok: false, label: `Problema: ${issues.join(' · ')}` };
  }, [health]);

  // Uso agregado por ferramenta (janela de atividade de 30 dias do relatório).
  const toolTotals = useMemo(() => users.reduce((acc, item) => {
    acc.cotatudo += item.activity?.uniqueCotatudoJobs || 0;
    acc.cotacaoReady += item.activity?.cotacaoReadyCount || 0;
    const actions = item.activity?.actions || {};
    Object.entries(actions).forEach(([action, count]) => {
      if (action.startsWith('vitrine_')) acc.vitrine += Number(count) || 0;
      else if (action.startsWith('whatsapp_')) acc.whatsapp += Number(count) || 0;
    });
    return acc;
  }, { cotatudo: 0, cotacaoReady: 0, vitrine: 0, whatsapp: 0 }), [users]);
  const filteredUsers = useMemo(() => {
    if (Array.isArray(segments[activeFilter])) {
      return segments[activeFilter];
    }
    if (activeFilter === 'used') {
      return users.filter((item) => item.activity?.hasToolUsage);
    }
    if (activeFilter === 'needsContact') {
      return users.filter((item) => item.followUp?.shouldContact);
    }
    if (activeFilter === 'neverUsed') {
      return users.filter((item) => !item.activity?.hasToolUsage);
    }
    if (activeFilter === 'expiringSoon') {
      return users
        .filter(isTrialExpiringSoon)
        .sort((a, b) => new Date(a.subscription?.trialEndsAt) - new Date(b.subscription?.trialEndsAt));
    }
    if (activeFilter === 'payingInactive') {
      return users.filter(isPayingInactive);
    }
    return users;
  }, [activeFilter, segments, users]);
  const activeFilterInfo = FILTERS[activeFilter] || FILTERS.allRegistered;
  const metricItems = [
    { key: 'allRegistered', icon: Users, label: FILTERS.allRegistered.label, value: totals.registeredUsers ?? totals.totalRegistered ?? users.length },
    { key: 'newUsers', icon: Users, label: FILTERS.newUsers.label, value: totals.recentUsers ?? segments.newUsers?.length ?? 0 },
    { key: 'suspiciousUsers', icon: AlertTriangle, label: FILTERS.suspiciousUsers.label, value: totals.suspiciousUsers ?? segments.suspiciousUsers?.length ?? 0 },
    { key: 'used', icon: Activity, label: FILTERS.used.label, value: totals.usedTool ?? 0 },
    { key: 'activeToday', icon: Clock3, label: FILTERS.activeToday.label, value: totals.activeToday ?? segments.activeToday?.length ?? 0 },
    { key: 'activeLast7Days', icon: Activity, label: FILTERS.activeLast7Days.label, value: totals.activeLast7Days ?? segments.activeLast7Days?.length ?? 0 },
    { key: 'stoppedUsing', icon: AlertTriangle, label: FILTERS.stoppedUsing.label, value: totals.stoppedUsing ?? totals.stoppedAfterUse ?? 0 },
    { key: 'needsContact', icon: MessageCircle, label: FILTERS.needsContact.label, value: totals.needsContact ?? 0 },
    { key: 'neverUsed', icon: Clock3, label: FILTERS.neverUsed.label, value: totals.neverUsed ?? totals.noUsage ?? 0 },
    { key: 'expiringSoon', icon: AlertTriangle, label: FILTERS.expiringSoon.label, value: expiringSoon },
    { key: 'payingInactive', icon: AlertTriangle, label: FILTERS.payingInactive.label, value: payingInactive },
  ];

  const copyUid = async (uid) => {
    try {
      await navigator.clipboard.writeText(uid);
      toast.success('UID copiado.');
    } catch {
      toast.warning('Não foi possível copiar o UID.');
    }
  };

  const searchForTrial = async () => {
    if (trialSearch.trim().length < 2) return;
    setTrialLoading(true);
    setTrialResults(null);
    try {
      const res = await api.get('/admin/apk-search-user', { params: { q: trialSearch.trim() } });
      setTrialResults(res.data.users || []);
    } catch {
      toast.error('Erro ao buscar usuário.');
    } finally {
      setTrialLoading(false);
    }
  };

  const grantTrial = async (uid, name, days = 15) => {
    setTrialGranting(uid);
    try {
      await api.post('/admin/apk-set-trial', { uid, days });
      toast.success(`${days} dias de trial concedidos para ${name}.`);
      setTrialResults((prev) => prev?.map((u) => u.uid === uid
        ? { ...u, subscriptionStatus: 'trialing', trialEndsAt: new Date(Date.now() + days * 86400000).toISOString() }
        : u
      ));
    } catch {
      toast.error('Erro ao conceder trial.');
    } finally {
      setTrialGranting('');
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
              {healthBadge && (
                <span className={`admin-health-badge ${healthBadge.ok ? 'ok' : 'bad'}`}>
                  {healthBadge.ok ? <ShieldCheck size={13} /> : <AlertTriangle size={13} />}
                  {healthBadge.label}
                </span>
              )}
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
        {billing && (
          <>
            <section className="admin-metrics-grid">
              <div className="admin-metric static">
                <div className="admin-metric-icon"><Users size={18} /></div>
                <div>
                  <div className="admin-metric-value">{billing.totals?.activeSubscribers ?? 0}</div>
                  <div className="admin-metric-label">Assinantes ativos</div>
                </div>
              </div>
              <div className="admin-metric static">
                <div className="admin-metric-icon"><Wallet size={18} /></div>
                <div>
                  <div className="admin-metric-value">{formatCurrency(billing.totals?.monthlyRevenueEstimate)}</div>
                  <div className="admin-metric-label">Receita mensal estimada</div>
                </div>
              </div>
              <div className="admin-metric static">
                <div className="admin-metric-icon"><CalendarClock size={18} /></div>
                <div>
                  <div className="admin-metric-value">{billing.totals?.upcomingRenewals ?? 0}</div>
                  <div className="admin-metric-label">Vencimentos em 7 dias</div>
                </div>
              </div>
              <div className={`admin-metric static${(billing.totals?.paymentIssues ?? 0) > 0 ? ' warn' : ''}`}>
                <div className="admin-metric-icon"><AlertTriangle size={18} /></div>
                <div>
                  <div className="admin-metric-value">{billing.totals?.paymentIssues ?? 0}</div>
                  <div className="admin-metric-label">Problemas de pagamento</div>
                </div>
              </div>
              <div className="admin-metric static">
                <div className="admin-metric-icon"><Activity size={18} /></div>
                <div>
                  <div className="admin-metric-value">
                    {billing.totals?.trialConversions ?? 0}
                    {billing.totals?.trialConversionRate != null ? ` (${billing.totals.trialConversionRate}%)` : ''}
                  </div>
                  <div className="admin-metric-label">Trials convertidos (7 dias)</div>
                </div>
              </div>
              <div className={`admin-metric static${(billing.totals?.trialRescues ?? 0) > 0 ? ' warn' : ''}`}>
                <div className="admin-metric-icon"><PhoneCall size={18} /></div>
                <div>
                  <div className="admin-metric-value">{billing.totals?.trialRescues ?? 0}</div>
                  <div className="admin-metric-label">Trials p/ resgatar (7 dias)</div>
                </div>
              </div>
              <div className={`admin-metric static${(billing.totals?.cancellations ?? 0) > 0 ? ' warn' : ''}`}>
                <div className="admin-metric-icon"><X size={18} /></div>
                <div>
                  <div className="admin-metric-value">{billing.totals?.cancellations ?? 0}</div>
                  <div className="admin-metric-label">Cancelamentos (7 dias)</div>
                </div>
              </div>
            </section>

            {billing.webhookAlerts?.length > 0 && (
              <div className="admin-alert danger">
                <div className="admin-alert-title">
                  <AlertTriangle size={17} />
                  <strong>
                    {billing.webhookAlerts.length} alerta{billing.webhookAlerts.length === 1 ? '' : 's'} de webhook nos últimos 7 dias
                  </strong>
                </div>
                <ul className="admin-alert-list">
                  {billing.webhookAlerts.slice(0, 8).map((alert) => (
                    <li key={`${alert.createdAt}-${alert.action}-${alert.uid || 'sem-uid'}`}>
                      <span>{formatDateTime(alert.createdAt)}</span>
                      {' — '}
                      {WEBHOOK_ALERT_LABELS[alert.action] || alert.action}
                      {alert.event ? ` (evento ${alert.event})` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {billing.paymentIssues?.length > 0 && (
              <section className="admin-list-section admin-billing-block">
                <div className="admin-section-header">
                  <div>
                    <h2>Problemas de pagamento</h2>
                    <p>Assinantes com pagamento pendente, vencido ou cartão recusado</p>
                  </div>
                </div>
                <div className="admin-job-list">
                  {billing.paymentIssues.map((issue) => {
                    const waUrl = whatsappUrl(issue.phone);
                    return (
                      <div className="admin-job" key={`issue-${issue.uid}`}>
                        <span>
                          {issue.name || 'Sem nome'} · {issue.email || 'Sem email'}
                        </span>
                        <strong>
                          {PAYMENT_ISSUE_LABELS[issue.paymentIssueEvent]
                            || (issue.status === 'pending' ? 'Pagamento pendente' : issue.status)}
                          {issue.nextDueDate ? ` · vence ${formatDateOnly(issue.nextDueDate)}` : ''}
                        </strong>
                        {waUrl ? (
                          <a className="admin-contact-link" href={waUrl} target="_blank" rel="noreferrer">
                            <MessageCircle size={14} /> WhatsApp
                          </a>
                        ) : (
                          <em>Sem telefone</em>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {billing.trialRescues?.length > 0 && (
              <section className="admin-list-section admin-billing-block">
                <div className="admin-section-header">
                  <div>
                    <h2>Resgate de trials</h2>
                    <p>Venceram há até 7 dias e ainda não assinaram — contato mais quente</p>
                  </div>
                </div>
                <div className="admin-job-list">
                  {billing.trialRescues.map((rescue) => {
                    const waUrl = whatsappUrl(rescue.phone);
                    return (
                      <div className="admin-job" key={`rescue-${rescue.uid}`}>
                        <span>{rescue.name || 'Sem nome'} · {rescue.email || 'Sem email'}</span>
                        <strong>Trial venceu {formatDateOnly(rescue.trialEndsAt)}</strong>
                        {waUrl ? (
                          <a className="admin-contact-link" href={waUrl} target="_blank" rel="noreferrer">
                            <MessageCircle size={14} /> WhatsApp
                          </a>
                        ) : (
                          <em>Sem telefone</em>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {billing.trialConversions?.length > 0 && (
              <section className="admin-list-section admin-billing-block">
                <div className="admin-section-header">
                  <div>
                    <h2>Novos assinantes</h2>
                    <p>Primeiro pagamento confirmado no período</p>
                  </div>
                </div>
                <div className="admin-job-list">
                  {billing.trialConversions.map((conv) => (
                    <div className="admin-job" key={`conv-${conv.uid}`}>
                      <span>{conv.name || 'Sem nome'} · {conv.email || 'Sem email'}</span>
                      <strong>Assinou {formatDateOnly(conv.firstPaymentDate)}</strong>
                      <em>{formatCurrency(conv.amount)}{conv.convertedFromTrial ? ' · veio do trial' : ''}</em>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {billing.cancellations?.length > 0 && (
              <section className="admin-list-section admin-billing-block">
                <div className="admin-section-header">
                  <div>
                    <h2>Cancelamentos recentes</h2>
                    <p>Vale um contato para entender o motivo — às vezes dá para reverter</p>
                  </div>
                </div>
                <div className="admin-job-list">
                  {billing.cancellations.map((cancel) => {
                    const waUrl = whatsappUrl(cancel.phone);
                    return (
                      <div className="admin-job" key={`cancel-${cancel.uid}`}>
                        <span>{cancel.name || 'Sem nome'} · {cancel.email || 'Sem email'}</span>
                        <strong>
                          Cancelou {formatDateOnly(cancel.canceledAt)}
                          {cancel.accessEndsAt ? ` · acesso até ${formatDateOnly(cancel.accessEndsAt)}` : ''}
                        </strong>
                        {waUrl ? (
                          <a className="admin-contact-link" href={waUrl} target="_blank" rel="noreferrer">
                            <MessageCircle size={14} /> WhatsApp
                          </a>
                        ) : (
                          <em>Sem telefone</em>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {billing.upcomingRenewals?.length > 0 && (
              <section className="admin-list-section admin-billing-block">
                <div className="admin-section-header">
                  <div>
                    <h2>Próximos vencimentos (7 dias)</h2>
                    <p>Cobranças que o Asaas vai gerar em breve</p>
                  </div>
                </div>
                <div className="admin-job-list">
                  {billing.upcomingRenewals.map((renewal) => (
                    <div className="admin-job" key={`renewal-${renewal.uid}`}>
                      <span>{renewal.name || 'Sem nome'} · {renewal.email || 'Sem email'}</span>
                      <strong>{formatDateOnly(renewal.nextDueDate)}</strong>
                      <em>{formatCurrency(renewal.amount)}</em>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

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

        <section className="admin-list-section">
          <div className="admin-section-header">
            <div>
              <h2>Uso por ferramenta</h2>
              <p>Últimos 30 dias — mostra o que segura os RCAs na plataforma</p>
            </div>
          </div>
          <div className="admin-metrics-grid">
            <div className="admin-metric static">
              <div className="admin-metric-icon"><Activity size={18} /></div>
              <div>
                <div className="admin-metric-value">{toolTotals.cotatudo}</div>
                <div className="admin-metric-label">Jobs Cotatudo</div>
              </div>
            </div>
            <div className="admin-metric static">
              <div className="admin-metric-icon"><Activity size={18} /></div>
              <div>
                <div className="admin-metric-value">{toolTotals.cotacaoReady}</div>
                <div className="admin-metric-label">Cotações Prontas</div>
              </div>
            </div>
            <div className="admin-metric static">
              <div className="admin-metric-icon"><Activity size={18} /></div>
              <div>
                <div className="admin-metric-value">{toolTotals.vitrine}</div>
                <div className="admin-metric-label">Eventos Vitrine</div>
              </div>
            </div>
            <div className="admin-metric static">
              <div className="admin-metric-icon"><MessageCircle size={18} /></div>
              <div>
                <div className="admin-metric-value">{toolTotals.whatsapp}</div>
                <div className="admin-metric-label">Eventos WhatsApp</div>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="admin-alert">
            <AlertTriangle size={17} /> {error}
          </div>
        )}

        {report?.warning && (
          <div className="admin-alert">
            <AlertTriangle size={17} /> {report.warning}
          </div>
        )}

        <section className="admin-list-section">
          <div className="admin-section-header">
            <div>
              <h2>{activeFilterInfo.title}</h2>
              <p>
                {report?.window?.since ? `Desde ${formatDateTime(report.window.since)}` : 'Carregando janela de consulta'}
                {report?.cachedAt ? ` · dados de ${formatDateTime(report.cachedAt)}` : ''}
              </p>
            </div>
            <div className="admin-section-actions">
              <span>
                {loading
                  ? 'Carregando...'
                  : `${filteredUsers.length} de ${users.length} registro${users.length === 1 ? '' : 's'}`}
              </span>
              {activeFilter !== 'allRegistered' && (
                <button type="button" className="admin-clear-filter" onClick={() => setActiveFilter('allRegistered')}>
                  <X size={14} /> Limpar
                </button>
              )}
            </div>
          </div>

          {!loading && filteredUsers.length === 0 && (
            <div className="admin-empty">{users.length === 0 ? FILTERS.allRegistered.empty : activeFilterInfo.empty}</div>
          )}

          <div className="admin-user-list">
            {filteredUsers.map((item) => {
              const status = statusLabel(item.subscription);
              const remainingDays = daysUntil(item.subscription?.trialEndsAt);
              const lastSession = item.activity?.lastSeenAt;
              const followUp = item.followUp || {};
              const risk = item.risk || {};
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
                    {risk.suspicious && <span className="admin-risk-badge">{risk.label || 'Cadastro suspeito'}</span>}
                    {followUp.shouldContact && <span className="admin-contact-badge">{followUp.reason}</span>}
                  </div>

                  {risk.suspicious && (
                    <div className={`admin-risk-box ${risk.level || 'medium'}`}>
                      <div className="admin-risk-title">
                        <AlertTriangle size={15} />
                        <strong>{risk.label || 'Possível cadastro duplicado'}</strong>
                        <span>{risk.score ? `score ${risk.score}` : 'verificar'}</span>
                      </div>
                      {risk.reasons?.length > 0 && (
                        <ul className="admin-risk-reasons">
                          {risk.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      )}
                      {risk.relatedUsers?.length > 0 && (
                        <div className="admin-risk-related">
                          {risk.relatedUsers.slice(0, 4).map((related) => {
                            const relatedStatus = statusLabel(related.subscription);
                            const relatedPhone = phoneDisplay(related.phone);
                            return (
                              <div className="admin-risk-related-item" key={related.uid || related.email}>
                                <div>
                                  <strong>{related.name || 'Sem nome'}</strong>
                                  <span>{related.email || 'Sem email'}</span>
                                </div>
                                <div>
                                  <span>{relatedPhone || 'Sem telefone'}</span>
                                  <span className={`admin-status ${relatedStatus.tone}`}>{relatedStatus.label}</span>
                                  <span>Trial: {formatDateTime(related.subscription?.trialEndsAt)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {item.activity?.recentCotatudoJobs?.length > 0 && (
                    <div className="admin-job-list">
                      {item.activity.recentCotatudoJobs.slice(0, 3).map((job) => (
                        <div className="admin-job" key={job.jobId || `${job.createdAt}-${job.prazo}`}>
                          <span>{formatDateTime(job.createdAt)} · {job.site || 'site'} · {job.modo || 'modo'} · {job.prazo || '-'} dias</span>
                          <strong>{job.preenchidos ?? 0}/{job.totalItens ?? 0} preenchidos</strong>
                          <em>{job.naoEncontrados ?? 0} não encontrados · {job.falhas ?? 0} falhas</em>
                          {job.diagnostics?.length > 0 && (
                            <details className="admin-job-diagnostics">
                              <summary>Diagnóstico ({job.diagnostics.length})</summary>
                              <ul>
                                {job.diagnostics.slice(0, 20).map((line, i) => (
                                  <li key={i}><code>{line}</code></li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {item.activity?.recentCotacaoReadyJobs?.length > 0 && (
                    <div className="admin-job-list">
                      {item.activity.recentCotacaoReadyJobs.slice(0, 3).map((job) => (
                        <div className="admin-job" key={job.sessionId || job.jobId || `${job.createdAt}-${job.prazo}`}>
                          <span>{formatDateTime(job.createdAt)} · Cotação Pronta · {job.modo || 'modo'} · {job.prazo || '-'} dias</span>
                          <strong>{job.preenchidos ?? 0}/{job.totalItens ?? 0} preenchidos</strong>
                          <em>{job.semMatch ?? 0} sem match</em>
                        </div>
                      ))}
                    </div>
                  )}

                  {item.activity?.recentToolEvents?.length > 0
                    && !item.activity?.recentCotatudoJobs?.length
                    && !item.activity?.recentCotacaoReadyJobs?.length && (
                    <div className="admin-event-list">
                      <div className="admin-event-list-title">Ferramentas recentes</div>
                      {item.activity.recentToolEvents.slice(0, 4).map((event) => (
                        <div className={`admin-event ${event.tone || 'neutral'}`} key={`tool-${event.createdAt}-${event.action}-${event.detail}`}>
                          <span className="admin-event-time">{formatDateTime(event.createdAt)}</span>
                          <strong>{event.label || event.action || 'Evento'}</strong>
                          <em>{event.detail || event.status || 'Registrado'}</em>
                        </div>
                      ))}
                    </div>
                  )}

                  {item.activity?.recentEvents?.length > 0 && (
                    <div className="admin-event-list">
                      <div className="admin-event-list-title">Linha do tempo recente</div>
                      {item.activity.recentEvents.slice(0, 6).map((event) => (
                        <div className={`admin-event ${event.tone || 'neutral'}`} key={`${event.createdAt}-${event.action}-${event.detail}`}>
                          <span className="admin-event-time">{formatDateTime(event.createdAt)}</span>
                          <strong>{event.label || event.action || 'Evento'}</strong>
                          <em>{event.detail || event.status || 'Registrado'}</em>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="admin-section">
          <h2 className="admin-section-title">Trial APK</h2>
          <div className="admin-trial-search">
            <input
              className="admin-trial-input"
              type="text"
              placeholder="Buscar RCA por nome ou CPF..."
              value={trialSearch}
              onChange={(e) => setTrialSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchForTrial()}
            />
            <button
              type="button"
              className="admin-refresh"
              onClick={searchForTrial}
              disabled={trialLoading || trialSearch.trim().length < 2}
            >
              {trialLoading ? <RefreshCw size={15} className="spinning" /> : 'Buscar'}
            </button>
          </div>

          {trialResults !== null && trialResults.length === 0 && (
            <p className="admin-empty">Nenhum RCA encontrado.</p>
          )}

          {trialResults && trialResults.length > 0 && (
            <div className="admin-trial-list">
              {trialResults.map((u) => (
                <div key={u.uid} className="admin-trial-row">
                  <div className="admin-trial-info">
                    <strong>{u.name || 'Sem nome'}</strong>
                    <span>{u.email}</span>
                    <span className={`admin-status-badge ${u.subscriptionStatus === 'trialing' ? 'ok' : u.subscriptionStatus === 'active' ? 'ok' : 'warn'}`}>
                      {u.subscriptionStatus}
                      {u.trialEndsAt ? ` — vence ${formatDateOnly(u.trialEndsAt)}` : ''}
                    </span>
                  </div>
                  <div className="admin-trial-actions">
                    <button
                      type="button"
                      className="admin-refresh"
                      disabled={trialGranting === u.uid}
                      onClick={() => grantTrial(u.uid, u.name, 15)}
                    >
                      {trialGranting === u.uid ? <RefreshCw size={14} className="spinning" /> : '15 dias trial'}
                    </button>
                    <button
                      type="button"
                      className="admin-refresh"
                      disabled={trialGranting === u.uid}
                      onClick={() => grantTrial(u.uid, u.name, 30)}
                    >
                      30 dias
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <MasterCampaignsAdmin />
      </main>
    </div>
  );
};

export default AdminPanel;
