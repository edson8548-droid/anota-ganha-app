import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Clipboard,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthContext } from '../contexts/AuthContext';
import api from '../services/api';
import { canAccessAdminPanel } from '../utils/adminAccess';
import './AdminPanel.css';

const DAY_OPTIONS = [4, 7, 30];

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
  const cotacaoReady = activity.cotacaoReadyCount || 0;
  const jobs = activity.uniqueCotatudoJobs || 0;
  const events = activity.auditEventCount || 0;
  if (cotacaoReady && jobs) return `${cotacaoReady} cotação${cotacaoReady === 1 ? '' : 'ões'} processada${cotacaoReady === 1 ? '' : 's'} + ${jobs} job${jobs === 1 ? '' : 's'} Cotatudo`;
  if (cotacaoReady) return `${cotacaoReady} cotação${cotacaoReady === 1 ? '' : 'ões'} processada${cotacaoReady === 1 ? '' : 's'}`;
  if (jobs) return `${jobs} job${jobs === 1 ? '' : 's'} de cotação`;
  if (events) return `${events} evento${events === 1 ? '' : 's'} registrado${events === 1 ? '' : 's'}`;
  return 'Sessão registrada';
};

const AdminMetric = ({ icon: Icon, label, value }) => (
  <div className="admin-metric">
    <div className="admin-metric-icon"><Icon size={18} /></div>
    <div>
      <div className="admin-metric-value">{value}</div>
      <div className="admin-metric-label">{label}</div>
    </div>
  </div>
);

const AdminPanel = () => {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const [days, setDays] = useState(4);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const expiringSoon = useMemo(() => users.filter((item) => {
    const remaining = daysUntil(item.subscription?.trialEndsAt);
    return remaining !== null && remaining >= 0 && remaining <= 3;
  }).length, [users]);

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
          <AdminMetric icon={Users} label="Novos RCAs" value={totals.recentUsers ?? 0} />
          <AdminMetric icon={Activity} label="Testaram a ferramenta" value={totals.usedTool ?? 0} />
          <AdminMetric icon={Clock3} label="Sem uso registrado" value={totals.noUsage ?? 0} />
          <AdminMetric icon={AlertTriangle} label="Trial vence em 3 dias" value={expiringSoon} />
        </section>

        {error && (
          <div className="admin-alert">
            <AlertTriangle size={17} /> {error}
          </div>
        )}

        <section className="admin-list-section">
          <div className="admin-section-header">
            <div>
              <h2>Cadastros recentes</h2>
              <p>{report?.window?.since ? `Desde ${formatDateTime(report.window.since)}` : 'Carregando janela de consulta'}</p>
            </div>
            <span>{loading ? 'Carregando...' : `${users.length} registro${users.length === 1 ? '' : 's'}`}</span>
          </div>

          {!loading && users.length === 0 && (
            <div className="admin-empty">Nenhum cadastro novo nessa janela.</div>
          )}

          <div className="admin-user-list">
            {users.map((item) => {
              const status = statusLabel(item.subscription);
              const remainingDays = daysUntil(item.subscription?.trialEndsAt);
              const lastSeen = item.activity?.lastSeenAt || item.activity?.lastEventAt;

              return (
                <article className="admin-user-row" key={item.uid}>
                  <div className="admin-user-main">
                    <div>
                      <h3>{item.name || 'Sem nome'}</h3>
                      <p>{item.email || 'Sem email'}</p>
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
                      <span>Último uso</span>
                      <strong>{formatDateTime(lastSeen)}</strong>
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
