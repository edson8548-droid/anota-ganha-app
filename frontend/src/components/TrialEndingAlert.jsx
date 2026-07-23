import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import { PLANS, useSubscription } from '../contexts/SubscriptionContext';
import './TrialEndingAlert.css';

const TRIAL_ALERT_WINDOW_DAYS = 3;
const MONTHLY_PLAN_PRICE = `R$ ${PLANS.monthly.price.toFixed(2).replace('.', ',')}`;

const localDayNumber = (date) => Date.UTC(
  date.getFullYear(),
  date.getMonth(),
  date.getDate(),
) / 86400000;

const formatLocalDateKey = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

const readDismissedAlert = (key) => {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};

export function getTrialEndingAlertContent(trialEndsAt, now = new Date()) {
  const end = trialEndsAt instanceof Date ? trialEndsAt : new Date(trialEndsAt);
  if (Number.isNaN(end.getTime()) || now >= end) return null;

  const daysLeft = localDayNumber(end) - localDayNumber(now);
  if (daysLeft < 0 || daysLeft > TRIAL_ALERT_WINDOW_DAYS) return null;

  const deadline = daysLeft === 0
    ? 'hoje'
    : daysLeft === 1
      ? 'amanhã'
      : `em ${daysLeft} dias`;

  return {
    daysLeft,
    message: `Seu teste do Venpro termina ${deadline}. Para não perder o acesso às suas cotações salvas, ative seu plano por apenas ${MONTHLY_PLAN_PRICE}.`,
  };
}

const TrialEndingAlert = () => {
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { isTrialActive, loading, trialEndsAt } = useSubscription();
  const [now, setNow] = useState(() => new Date());
  const [dismissedKey, setDismissedKey] = useState(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const content = useMemo(
    () => getTrialEndingAlertContent(trialEndsAt, now),
    [trialEndsAt, now],
  );
  const userKey = user?.uid || user?.id || user?._id || user?.email || 'usuario';
  const storageKey = `venpro:trial-ending-alert:${userKey}:${formatLocalDateKey(now)}`;
  const dismissed = dismissedKey === storageKey || readDismissedAlert(storageKey);

  if (loading || !isTrialActive || !content || dismissed) return null;

  const dismissForToday = () => {
    try {
      window.localStorage.setItem(storageKey, '1');
    } catch {
      // O estado em memória ainda fecha o aviso quando o navegador bloqueia o storage.
    }
    setDismissedKey(storageKey);
  };

  return (
    <aside className="trial-ending-alert" role="alert" aria-live="polite">
      <button
        type="button"
        className="trial-ending-alert__close"
        onClick={dismissForToday}
        aria-label="Fechar aviso até amanhã"
        title="Fechar até amanhã"
      >
        ×
      </button>
      <div className="trial-ending-alert__eyebrow">Últimos dias do teste</div>
      <strong className="trial-ending-alert__title">Seu acesso termina em breve</strong>
      <p>{content.message}</p>
      <button
        type="button"
        className="trial-ending-alert__action"
        onClick={() => navigate('/plans')}
      >
        Ativar plano
      </button>
    </aside>
  );
};

export default TrialEndingAlert;
