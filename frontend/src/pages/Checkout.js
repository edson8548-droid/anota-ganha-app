// SUBSTITUA: src/pages/Checkout.js
// VERSÃO FINAL: HARDCODED com a URL de PRODUÇÃO do RAILWAY
// Corrige o erro de "localhost" no ambiente online.

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuthContext } from '../contexts/AuthContext';
import './Checkout.css';

// ⭐️ VARIÁVEIS DE PRODUÇÃO ⭐️
const BACKEND_URL = "https://anota-ganha-app-production.up.railway.app";
const MERCADOPAGO_PUBLIC_KEY = "APP_USR-5f6e941d-3514-489a-9241-d8a42099b2d0";

const Checkout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { PLANS } = useSubscription();
  const authData = useAuthContext();
  const user = authData?.user;

  const [selectedPlan, setSelectedPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('credit_card');

  // Carregar plano selecionado
  useEffect(() => {
    const planId = location.state?.planId;
    if (planId && PLANS[planId]) {
      setSelectedPlan(PLANS[planId]);
    } else {
      console.log("Nenhum planId encontrado, voltando...");
      navigate('/plans');
    }
  }, [location, PLANS, navigate]);

  // Carregar SDK do Mercado Pago
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    document.body.appendChild(script);

    script.onload = () => {
      console.log('✅ Mercado Pago SDK carregado (Produção)');
      try {
        window.mpInstance = new window.MercadoPago(MERCADOPAGO_PUBLIC_KEY, {
          locale: 'pt-BR'
        });
        console.log('✅ Mercado Pago inicializado (Produção)');
      } catch (e) {
        console.error("Falha ao inicializar MP:", e);
      }
    };

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  // Processar Pagamento (chama o backend)
  const handleCheckout = async () => {
    if (!selectedPlan || !user || !window.mpInstance) {
      alert('⚠️ Erro ao processar pagamento. Verifique se está logado e tente novamente.');
      return;
    }

    setLoading(true);

    try {
      console.log('💳 Iniciando checkout (Produção)...');
      console.log('📦 Plano:', selectedPlan.id);
      console.log('👤 Usuário:', user.email, 'ID:', user.uid);

      // ⭐️ 1. CHAMAR NOSSO BACKEND FASTAPI (URL CORRETA) ⭐️
      const apiUrl = `${BACKEND_URL}/api/mercadopago/create-preference`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId: selectedPlan.id,
          user: {
            email: user.email,
            name: user.displayName || user.email,
            id: user.uid 
          }
        })
      });

      if (!response.ok) {
        const err = await response.json();
        console.error("Erro do backend:", err);
        throw new Error('Erro ao criar preferência de pagamento no backend');
      }

      const data = await response.json();
      console.log('✅ Preferência criada (Produção):', data.preferenceId);
      console.log('🚀 Redirecionando para:', data.initPoint);

      // ⭐️ 2. REDIRECIONAR PARA O CHECKOUT PRO ⭐️
      window.location.href = data.initPoint;

    } catch (error) {
      console.error('❌ Erro no handleCheckout:', error);
      alert('Erro ao processar pagamento. Tente novamente.');
      setLoading(false);
    }
  };

  if (!selectedPlan) {
    return <div>Carregando...</div>;
  }

  // O JSX (visual) permanece o mesmo
  return (
    <div className="checkout-page">
      <div className="checkout-container">
        {/* Header */}
        <div className="checkout-header">
          <button className="btn-back-checkout" onClick={() => navigate('/plans')}>
            ← Voltar para Planos
          </button>
          <h1>Finalizar Assinatura</h1>
        </div>

        <div className="checkout-grid">
          {/* Coluna Esquerda - Resumo do Pedido */}
          <div className="checkout-summary">
            <h2>Resumo do Pedido</h2>
            <div className="plan-summary-card">
              <div className="plan-summary-header">
                <span className="plan-badge-small">{selectedPlan.displayName.split(' ')[0]}</span>
                <h3>{selectedPlan.name}</h3>
              </div>
              <div className="plan-summary-price">
                {selectedPlan.id === 'annual_installments' ? (
                  <>
                    <div className="price-installments-checkout">
                      12x de R$ {selectedPlan.pricePerMonth.toFixed(2)}
                    </div>
                    <div className="price-total-checkout">
                      Total: R$ {selectedPlan.price.toFixed(2)}/ano
                    </div>
                  </>
                ) : (
                  <div className="price-main-checkout">
                    R$ {selectedPlan.price.toFixed(2)}
                    <span className="price-period-checkout">/{selectedPlan.id === 'monthly' ? 'mês' : 'ano'}</span>
                  </div>
                )}
              </div>
              {selectedPlan.savings && (
                <div className="savings-checkout">
                  💰 Você economiza R$ {selectedPlan.savings.toFixed(2)} por ano!
                </div>
              )}
              <div className="plan-summary-features">
                <h4>O que está incluído:</h4>
                <ul>
                  {selectedPlan.features.map((feature, idx) => (
                    <li key={idx}>✓ {feature}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="trial-info-checkout">
              <div className="trial-icon-checkout">🎁</div>
              <div>
                <strong>15 dias grátis</strong>
                <p>O seu plano pago só começará após o fim do seu trial.</p>
              </div>
            </div>
          </div>

          {/* Coluna Direita - Pagamento */}
          <div className="checkout-payment">
            <h2>Método de Pagamento</h2>
            <div className="payment-methods">
              <label className={`payment-method-option ${paymentMethod === 'credit_card' ? 'selected' : ''}`}>
                <input
                  type="radio" name="paymentMethod" value="credit_card"
                  checked={paymentMethod === 'credit_card'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <div className="payment-method-content">
                  <span className="payment-icon">💳</span>
                  <div>
                    <strong>Cartão de Crédito</strong>
                    <p>Pagamento seguro via Mercado Pago</p>
                  </div>
                </div>
              </label>
              <label className={`payment-method-option ${paymentMethod === 'pix' ? 'selected' : ''}`}>
                <input
                  type="radio" name="paymentMethod" value="pix"
                  checked={paymentMethod === 'pix'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <div className="payment-method-content">
                  <span className="payment-icon">📱</span>
                  <div>
                    <strong>PIX</strong>
                    <p>Aprovação instantânea</p>
                  </div>
                </div>
              </label>
            </div>
            <button
              className="btn-checkout"
              onClick={handleCheckout}
              disabled={loading}
            >
              {loading ? '⏳ Processando...' : '🔒 Finalizar Pagamento'}
            </button>
            <div className="security-badges">
              <p>🔒 Pagamento 100% seguro</p>
              <p>✓ Criptografia SSL</p>
              <p>✓ Dados protegidos pelo Mercado Pago</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;