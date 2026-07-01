import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Clipboard,
  Clock3,
  MessageCircle,
  Phone,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthContext } from '../contexts/AuthContext';
import api from '../services/api';
import { canAccessAdminPanel } from '../utils/adminAccess';
import './AdminPanel.css';

const DAY_OPTIONS = [4, 7, 30];
const SEGMENT_OPTIONS = [
  {
    key: 'allRegistered',
    totalKey: 'registeredUsers',
    icon: Users,
    label: 'RCAs cadastrados',
    title: 'Todos os RCAs cadastrados',
    empty: 'Nenhum RCA cadastrado foi encontrado.',
  },
  {
    key: 'newUsers',
    totalKey: 'recentUsers',
    icon: Calendar,
    label: 'Novos no período',
    title: 'Cadastros novos',
    empty: 'Nenhum cadastro novo nessa janela.',
  },
  {
    key: 'activeToday',
    totalKey: 'activeToday',
    icon: Activity,
    label: 'Usaram hoje',
    title: 'RCAs usando hoje',
    empty: 'Nenhum RCA usou a ferramenta hoje.',
  },
  {
    key: 'activeLast7Days',
    totalKey: 'activeLast7Days',
    icon: UserCheck,
    label: 'Usaram 7 dias',
    title: 'RCAs ativos na semana',
    empty: 'Nenhum RCA usou a ferramenta nos últimos 7 dias.',
  },
  {
    key: 'stoppedUsing',
    totalKey: 'stoppedUsing',
    icon: Clock3,
    label: 'Pararam de usar',
    title: 'RCAs para chamar',
    empty: 'Nenhum RCA com uso antigo parado foi encontrado.',
  },
  {
    key: 'oldRegisteredActive',
    totalKey: 'oldRegisteredActive',
    icon: ShieldCheck,
    label: 'Antigos ativos',
    title: 'Cadastrados há mais tempo e ainda usando',
    empty: 'Nenhum cadastro antigo ativo foi encontrado.',
  },
  {
    key: 'oldRegisteredStopped',
    totalKey: 'oldRegisteredStopped',
    icon: UserX,
    label: 'Entraram e pararam',
    title: 'Cadastrados antigos que pararam',
    empty: 'Nenhum cadastro antigo parado foi encontrado.',
  },
  {
    key: 'neverUsed',
    totalKey: 'neverUsed',
    icon: AlertTriangle,
    label: 'Nunca usaram',
    title: 'Cadastrados sem uso registrado',
    empty: 'Nenhum RCA sem uso registrado foi encontrado.',
  },
];

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

const formatDaysAgo = (value) => {
  if (value === null || value === undefined) return 'Sem registro';
  if (value === 0) return 'Hoje';
  if (value === 1) return 'há 1 dia';
  return `há ${value} dias`;
};

const formatAccountAge = (value) => {
  if (value === null || value === undefined) return 'Sem data';
  if (value === 0) return 'Hoje';
  if (value === 1) return '1 dia';
  return `${value} dias`;
};

const phoneDigits = (value) => String(value || '').replace(/\D/g, '');

const formatPhone = (value) => {
  const digits = phoneDigits(value);
  if (!digits) return 'Sem telefone';
  const local = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return digits;
};

const whatsappUrl = (item) => {
  const digits = phoneDigits(item?.phone);
  if (digits.length < 10) return null;
  const normalized = digits.startsWith('55') && digits.length > 11 ? digits : `55${digits}`;
  const firstName = String(item?.name || '').trim().split(/\s+/)[0] || 'tudo bem';
  const message = `Olá, ${firstName}. Aqui é o Edson da Venpro. Vi seu cadastro e queria entender se posso ajudar você a usar melhor a ferramenta.`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
};

const statusLabel = (subscription) => {
  if (!subscription) return { label: 'Sem assinatura', tone: 'neutral' };
  if (subscription.status === 'trialing') return { label: 'Trial ativo', tone: 'ok' };
  if (subscription.status === 'active') return { label: 'Assinante ativo', tone: 'ok' };
  if (subscription.status === 'pending') return { label: 'Pendente', tone: 'warn' };
  if (subscription.status === 'trial_expired') return { label: 'Trial expirado', tone: 'danger' };
  if (subscription.status === 'canceled') return { label: 'Cancelado', tone: 'danger' };
  return { label: subscription.status || 'Indefinido', tone: 'neutral' };
};

const summarizeActivity = (activity) => {
  if (!activity?.hasToolUsage) return 'Sem uso registrado';
  const jobs = activity.totalCotatudoJobs || activity.uniqueCotatudoJobs || 0;
  const events = activity.recentAuditEventCount ?? activity.auditEventCount ?? 0;
  const suffix = activity.daysSinceLastActivity !== null && activity.daysSinceLastActivity !== undefined
    ? ` · último uso ${formatDaysAgo(activity.daysSinceLastActivity)}`
    : '';
  if (jobs) return `${jobs} job${jobs === 1 ? '' : 's'} de cotação${suffix}`;
  if (events) return `${events} evento${events === 1 ? '' : 's'} registrado${events === 1 ? '' : 's'}${suffix}`;
  return `Sessão registrada${suffix}`;
};

const AdminMetric = ({ active, icon: Icon, label, onClick, value }) => (
  <button type="button" className={`admin-metric ${active ? 'active' : ''}`} onClick={onClick}>
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
  const [selectedSegment, setSelectedSegment] = useState('allRegistered');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canViewAdmin = canAccessAdminPanel(user);

  const loadReport = useCallback(async () => {
    if (!canViewAdmin) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/admin/recent-users', { params: { days, limit: 200 } });
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
  const segments = report?.segments || {};
  const allRegisteredUsers = segments.allRegistered || users;
  const selectedConfig = SEGMENT_OPTIONS.find((item) => item.key === selectedSegment) || SEGMENT_OPTIONS[0];
  const selectedUsers = segments[selectedSegment] || (selectedSegment === 'allRegistered' ? allRegisteredUsers : users);

  const expiringSoon = useMemo(() => allRegisteredUsers.filter((item) => {
    const remaining = daysUntil(item.subscription?.trialEndsAt);
    return remaining !== null && remaining >= 0 && remaining <= 3;
  }).length, [allRegisteredUsers]);

  const segmentDescription = useMemo(() => {
    const staleDays = report?.window?.staleAfterDays || 14;
    const longTermDays = report?.window?.longTermAccountDays || 30;
    if (selectedSegment === 'newUsers') return `Cadastros feitos nos últimos ${days} dias.`;
    if (selectedSegment === 'activeToday') return 'RCAs com login ou evento registrado nas últimas 24 horas.';
    if (selectedSegment === 'activeLast7Days') return 'RCAs com login ou evento registrado nos últimos 7 dias.';
    if (selectedSegment === 'stoppedUsing') return `RCAs que já usaram e estão sem uso há ${staleDays} dias ou mais.`;
    if (selectedSegment === 'oldRegisteredActive') return `Cadastrados há ${longTermDays} dias ou mais e ativos nos últimos 7 dias.`;
    if (selectedSegment === 'oldRegisteredStopped') return `Cadastrados há ${longTermDays} dias ou mais que pararam de usar.`;
    if (selectedSegment === 'neverUsed') return 'RCAs cadastrados sem uso registrado no painel.';
    return 'Base total de RCAs cadastrados carregada para acompanhamento.';
  }, [days, report?.window?.longTermAccountDays, report?.window?.staleAfterDays, selectedSegment]);

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
          {SEGMENT_OPTIONS.map((option) => (
            <AdminMetric
              key={option.key}
              active={selectedSegment === option.key}
              icon={option.icon}
              label={option.label}
              value={totals[option.totalKey] ?? 0}
              onClick={() => setSelectedSegment(option.key)}
            />
          ))}
        </section>

        <div className="admin-secondary-metrics">
          <span><Activity size={14} /> {totals.usedTool ?? 0} já testaram a ferramenta</span>
          <span><Clock3 size={14} /> {totals.noUsage ?? 0} sem uso registrado</span>
          <span><AlertTriangle size={14} /> {expiringSoon} trials vencem em 3 dias</span>
        </div>

        {error && (
          <div className="admin-alert">
            <AlertTriangle size={17} /> {error}
          </div>
        )}

        <section className="admin-list-section">
          <div className="admin-section-header">
            <div>
              <h2>{selectedConfig.title}</h2>
              <p>{segmentDescription}</p>
            </div>
            <span>{loading ? 'Carregando...' : `${selectedUsers.length} registro${selectedUsers.length === 1 ? '' : 's'}`}</span>
          </div>

          {!loading && selectedUsers.length === 0 && (
            <div className="admin-empty">{selectedConfig.empty}</div>
          )}

          <div className="admin-user-list">
            {selectedUsers.map((item) => {
              const status = statusLabel(item.subscription);
              const periodEnd = item.subscription?.trialEndsAt || item.subscription?.accessEndsAt;
              const remainingDays = daysUntil(periodEnd);
              const lastSeen = item.activity?.lastActivityAt || item.activity?.lastSeenAt || item.activity?.lastEventAt;
              const contactUrl = whatsappUrl(item);

              return (
                <article className="admin-user-row" key={item.uid}>
                  <div className="admin-user-main">
                    <div>
                      <h3>{item.name || 'Sem nome'}</h3>
                      <p>{item.email || 'Sem email'}</p>
                      <div className="admin-contact-line">
                        <span><Phone size={13} /> {formatPhone(item.phone)}</span>
                        {contactUrl && (
                          <a className="admin-whatsapp" href={contactUrl} target="_blank" rel="noopener noreferrer">
                            <MessageCircle size={14} /> Chamar
                          </a>
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
                      <span>Tempo cadastrado</span>
                      <strong>{formatAccountAge(item.accountAgeDays)}</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong className={`admin-status ${status.tone}`}>{status.label}</strong>
                    </div>
                    <div>
                      <span>Fim do acesso</span>
                      <strong>
                        {formatDateTime(periodEnd)}
                        {remainingDays !== null && remainingDays >= 0 ? ` (${remainingDays}d)` : ''}
                      </strong>
                    </div>
                    <div>
                      <span>Primeiro uso</span>
                      <strong>{formatDateTime(item.activity?.firstActivityAt)}</strong>
                    </div>
                    <div>
                      <span>Último uso</span>
                      <strong>{formatDateTime(lastSeen)}</strong>
                    </div>
                    <div>
                      <span>Sem uso há</span>
                      <strong>{formatDaysAgo(item.activity?.daysSinceLastActivity)}</strong>
                    </div>
                  </div>

                  <div className="admin-activity-line">
                    <span>{summarizeActivity(item.activity)}</span>
                    <span>{item.activity?.deviceCount || 0} dispositivo{item.activity?.deviceCount === 1 ? '' : 's'}</span>
                    <span>{item.activity?.loginCount || 0} sessão{item.activity?.loginCount === 1 ? '' : 'ões'}</span>
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
