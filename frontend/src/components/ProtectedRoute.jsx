// src/components/ProtectedRoute.js
import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';

const LoadingScreen = ({ text }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    fontSize: '18px',
    flexDirection: 'column',
    gap: '15px'
  }}>
    <div>{text}</div>
    <div style={{
      width: '40px',
      height: '40px',
      border: '4px solid #f3f3f3',
      borderTop: '4px solid #3498db',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    }}></div>
    <style>{`
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);

const SUPPORT_WHATSAPP_URL = 'https://wa.me/5513996382430?text=Ol%C3%A1%2C%20recebi%20um%20aviso%20sobre%20meu%20per%C3%ADodo%20de%20teste%20no%20Venpro%20e%20gostaria%20de%20verificar.';

const SubscriptionRequired = ({ subscription }) => {
  const navigate = useNavigate();
  const duplicateTrial = subscription?.blockNotice === 'duplicate_trial';

  if (duplicateTrial) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#2B2D31',
        color: '#E1E1E1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
      }}>
        <div style={{
          width: '100%',
          maxWidth: 480,
          background: '#363940',
          border: '1px solid #4A4D52',
          borderRadius: 14,
          padding: 28,
          textAlign: 'center',
          boxShadow: '0 18px 50px rgba(0,0,0,.22)'
        }}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>⏰</div>
          <h2 style={{ margin: '0 0 10px', color: '#fff', fontSize: 22 }}>Período de teste encerrado</h2>
          <p style={{ margin: '0 0 14px', color: '#A0A3A8', lineHeight: 1.6, fontSize: 14 }}>
            Nosso sistema identificou mais de um período de teste utilizado neste mesmo
            dispositivo, o que não é permitido pelos nossos termos de uso. Por isso, este
            teste foi encerrado.
          </p>
          <p style={{ margin: '0 0 22px', color: '#A0A3A8', lineHeight: 1.6, fontSize: 14 }}>
            Para continuar usando o Venpro, escolha um dos planos disponíveis. Se você
            acredita que houve um engano, entre em contato com o suporte da Venpro —
            teremos prazer em verificar.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/plans')}
              style={{
                background: '#3A85A8',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '11px 18px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Ver planos
            </button>
            <a
              href={SUPPORT_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: 'transparent',
                color: '#A0A3A8',
                border: '1px solid #4A4D52',
                borderRadius: 8,
                padding: '11px 18px',
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'none'
              }}
            >
              Falar com o suporte
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#2B2D31',
      color: '#E1E1E1',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    }}>
      <div style={{
        width: '100%',
        maxWidth: 460,
        background: '#363940',
        border: '1px solid #4A4D52',
        borderRadius: 14,
        padding: 28,
        textAlign: 'center',
        boxShadow: '0 18px 50px rgba(0,0,0,.22)'
      }}>
        <div style={{ fontSize: 34, marginBottom: 12 }}>🔒</div>
        <h2 style={{ margin: '0 0 10px', color: '#fff', fontSize: 22 }}>Assinatura necessária</h2>
        <p style={{ margin: '0 0 22px', color: '#A0A3A8', lineHeight: 1.6, fontSize: 14 }}>
          Sua assinatura está cancelada ou expirada. Para usar esta ferramenta do Venpro, assine novamente.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/plans')}
            style={{
              background: '#3A85A8',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '11px 18px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Assinar novamente
          </button>
          <button
            onClick={() => navigate('/minha-licenca')}
            style={{
              background: 'transparent',
              color: '#A0A3A8',
              border: '1px solid #4A4D52',
              borderRadius: 8,
              padding: '11px 18px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Ver licença
          </button>
        </div>
      </div>
    </div>
  );
};

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getPaidAccessEnd = (subscription) => {
  const explicitEnd = toDate(subscription?.accessEndsAt);
  if (explicitEnd) return explicitEnd;

  const currentPeriodEnd = toDate(subscription?.currentPeriodEnd);
  if (currentPeriodEnd) return currentPeriodEnd;

  const lastPayment = toDate(subscription?.lastPaymentDate);
  if (!lastPayment) return null;

  return new Date(lastPayment.getTime() + 30 * 24 * 60 * 60 * 1000);
};

const ProtectedRoute = ({ children, requireSubscription = false }) => {
  const { user, loading } = useAuthContext();
  const subscriptionState = useSubscription();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen text="Verificando autenticação..." />;
  }

  if (!user) {
    // Redirecionar para login e salvar a rota que o usuário tentou acessar
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireSubscription) {
    if (subscriptionState.loading) {
      return <LoadingScreen text="Verificando assinatura..." />;
    }

    const subscription = subscriptionState.subscription;
    const accessEndsAt = getPaidAccessEnd(subscription);
    const paidAccessStatuses = ['canceling', 'canceled', 'pending'];
    const hasPaidAccess = paidAccessStatuses.includes(subscription?.status) && accessEndsAt && accessEndsAt > new Date();
    const hasAccess = subscription?.status === 'active' || subscriptionState.isTrialActive || hasPaidAccess;
    if (!hasAccess) {
      return <SubscriptionRequired subscription={subscription} />;
    }
  }

  return children;
};

export default ProtectedRoute;
