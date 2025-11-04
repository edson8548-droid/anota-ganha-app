// COLE EM: src/pages/Plans.js
// Página de escolha de planos

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuthContext } from '../contexts/AuthContext';
import './Plans.css';

const Plans = () => {
  const navigate = useNavigate();
  const { currentPlan, isTrialActive, trialEndsAt, PLANS } = useSubscription();
  const authData = useAuthContext();
  const user = authData?.user;

  const [loading, setLoading] = useState(null); // ID do plano em loading

  // ============================================
  // CALCULAR DIAS RESTANTES DO TRIAL
  // ============================================
  const getTrialDaysLeft = () => {
    if (!isTrialActive || !trialEndsAt) return 0;
    const now = new Date();
    const diff = trialEndsAt - now;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  // ============================================
  // HANDLER PARA SELECIONAR PLANO
  // ============================================
  const handleSelectPlan = async (planId) => {
    console.log('📦 Plano selecionado:', planId);
    
    if (planId === 'trial') {
      alert('Você já está no período de trial!');
      return;
    }

    setLoading(planId);

    try {
      // Redirecionar para página de checkout
      navigate('/checkout', { state: { planId } });
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao processar. Tente novamente.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="plans-page">
      {/* Header */}
      <div className="plans-header">
        <button className="btn-back" onClick={() => navigate('/dashboard')}>
          ← Voltar
        </button>
        <div className="plans-header-content">
          <h1>Escolha seu Plano</h1>
          <p className="plans-subtitle">
            Comece com 15 dias grátis. Cancele quando quiser.
          </p>
        </div>
      </div>

      {/* Trial Banner */}
      {isTrialActive && (
        <div className="trial-banner">
          <div className="trial-icon">🎁</div>
          <div className="trial-info">
            <h3>Seu Trial Está Ativo!</h3>
            <p>
              Você tem <strong>{getTrialDaysLeft()} dias restantes</strong> com acesso total.
              Escolha um plano antes do trial acabar para continuar sem interrupções.
            </p>
          </div>
        </div>
      )}

      {/* Current Plan */}
      {currentPlan && !isTrialActive && (
        <div className="current-plan-banner">
          <div className="current-plan-icon">✅</div>
          <div className="current-plan-info">
            <h3>Plano Atual: {currentPlan.displayName}</h3>
            <p>Sua assinatura está ativa e renovando automaticamente.</p>
          </div>
        </div>
      )}

      {/* Plans Grid */}
      <div className="plans-grid">
        {/* Plano Mensal */}
        <div className="plan-card">
          <div className="plan-badge">📦</div>
          <h2 className="plan-name">{PLANS.monthly.name}</h2>
          <div className="plan-price">
            <span className="price-currency">R$</span>
            <span className="price-value">39</span>
            <span className="price-cents">,00</span>
            <span className="price-period">/mês</span>
          </div>
          <p className="plan-billing">{PLANS.monthly.billingCycle}</p>

          <ul className="plan-features">
            {PLANS.monthly.features.map((feature, idx) => (
              <li key={idx}>
                <span className="feature-icon">✓</span>
                {feature}
              </li>
            ))}
          </ul>

          <button
            className={`btn-select-plan ${currentPlan?.id === 'monthly' ? 'current' : ''}`}
            onClick={() => handleSelectPlan('monthly')}
            disabled={loading === 'monthly' || currentPlan?.id === 'monthly'}
          >
            {loading === 'monthly' ? '⏳ Processando...' : 
             currentPlan?.id === 'monthly' ? '✓ Plano Atual' : 
             'Escolher Plano'}
          </button>
        </div>

        {/* Plano Anual Parcelado - DESTACADO */}
        <div className="plan-card highlighted">
          <div className="plan-badge-highlight">🚀 MAIS POPULAR</div>
          <h2 className="plan-name">{PLANS.annual_installments.name}</h2>
          <div className="plan-price">
            <span className="price-installments">12x de</span>
            <span className="price-currency">R$</span>
            <span className="price-value">32</span>
            <span className="price-cents">,90</span>
          </div>
          <p className="plan-total">Total: R$ 394,80/ano</p>
          <p className="plan-billing">{PLANS.annual_installments.billingCycle}</p>

          <div className="savings-badge">
            💰 Economize R$ {PLANS.annual_installments.savings.toFixed(2)}
          </div>

          <ul className="plan-features">
            {PLANS.annual_installments.features.map((feature, idx) => (
              <li key={idx}>
                <span className="feature-icon">✓</span>
                {feature}
              </li>
            ))}
          </ul>

          <button
            className={`btn-select-plan ${currentPlan?.id === 'annual_installments' ? 'current' : ''}`}
            onClick={() => handleSelectPlan('annual_installments')}
            disabled={loading === 'annual_installments' || currentPlan?.id === 'annual_installments'}
          >
            {loading === 'annual_installments' ? '⏳ Processando...' : 
             currentPlan?.id === 'annual_installments' ? '✓ Plano Atual' : 
             'Escolher Plano'}
          </button>
        </div>

        {/* Plano Anual à Vista */}
        <div className="plan-card best-value">
          <div className="plan-badge-best">💎 MELHOR VALOR</div>
          <h2 className="plan-name">{PLANS.annual_upfront.name}</h2>
          <div className="plan-price">
            <span className="price-currency">R$</span>
            <span className="price-value">360</span>
            <span className="price-cents">,00</span>
            <span className="price-period">/ano</span>
          </div>
          <p className="plan-billing">{PLANS.annual_upfront.billingCycle}</p>

          <div className="savings-badge">
            💰 Economize R$ {PLANS.annual_upfront.savings.toFixed(2)}
          </div>

          <ul className="plan-features">
            {PLANS.annual_upfront.features.map((feature, idx) => (
              <li key={idx}>
                <span className="feature-icon">✓</span>
                {feature}
              </li>
            ))}
          </ul>

          <button
            className={`btn-select-plan ${currentPlan?.id === 'annual_upfront' ? 'current' : ''}`}
            onClick={() => handleSelectPlan('annual_upfront')}
            disabled={loading === 'annual_upfront' || currentPlan?.id === 'annual_upfront'}
          >
            {loading === 'annual_upfront' ? '⏳ Processando...' : 
             currentPlan?.id === 'annual_upfront' ? '✓ Plano Atual' : 
             'Escolher Plano'}
          </button>
        </div>
      </div>

      {/* FAQ / Info */}
      <div className="plans-info">
        <h3>❓ Perguntas Frequentes</h3>
        
        <div className="faq-item">
          <strong>Posso cancelar a qualquer momento?</strong>
          <p>Sim! Você pode cancelar sua assinatura a qualquer momento sem multas ou taxas adicionais.</p>
        </div>

        <div className="faq-item">
          <strong>Como funciona a renovação automática?</strong>
          <p>Sua assinatura renova automaticamente no vencimento. Você receberá um lembrete por email antes da cobrança.</p>
        </div>

        <div className="faq-item">
          <strong>Posso mudar de plano depois?</strong>
          <p>Sim! Você pode fazer upgrade ou downgrade do seu plano a qualquer momento.</p>
        </div>

        <div className="faq-item">
          <strong>Quais formas de pagamento aceitas?</strong>
          <p>Aceitamos cartão de crédito e PIX através do Mercado Pago, plataforma 100% segura.</p>
        </div>
      </div>

      {/* Footer */}
      <div className="plans-footer">
        <p>🔒 Pagamento seguro via Mercado Pago</p>
        <p>✉️ Dúvidas? Entre em contato: suporte@anotaganha.com</p>
      </div>
    </div>
  );
};

export default Plans;
