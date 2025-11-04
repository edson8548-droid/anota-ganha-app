// SUBSTITUA: src/pages/Checkout.js
// VERSÃO FINAL CORRIGIDA: Usa a URL de Produção hardcoded para evitar o erro de navegador/cache.
// ⭐️ OTIMIZADO: Adicionada a lógica para capturar e enviar o Device ID. ⭐️

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuthContext } from '../contexts/AuthContext';
import './Checkout.css';

// ⭐️ VARIÁVEIS DE PRODUÇÃO (Hardcoded para robustez) ⭐️
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
  const [paymentMethod, setPaymentMethod] = useState('credit_card'); // Mantemos o estado, mas o MP gere o método

  // Carregar plano selecionado
  useEffect(() => {
    const planId = location.state?.planId;
    if (planId && PLANS[planId]) {
      setSelectedPlan(PLANS[planId]);
    } else {
      navigate('/plans');
    }
  }, [location, PLANS, navigate]);

  // Carregar SDK do Mercado Pago (Mantido para inicialização, mas não é usado para o checkout)
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    document.body.appendChild(script);

    script.onload = () => {
      try {
        window.mpInstance = new window.MercadoPago(MERCADOPAGO_PUBLIC_KEY, { locale: 'pt-BR' });
      } catch (e) {
        console.error("Falha ao inicializar MP:", e);
      }
    };
    return () => {
      if (document.body.contains(script)) { document.body.removeChild(script); }
    };
  }, []);

  // ============================================
  // PROCESSAR PAGAMENTO (FLUXO ROBUSTO E OTIMIZADO)
  // ============================================
  const handleCheckout = async () => {
    if (!selectedPlan || !user) {
      alert('⚠️ Erro ao processar pagamento. Tente novamente.');
      return;
    }

    setLoading(true);

    try {
      // ⭐️ PASSO 1: CAPTURAR O DEVICE ID PARA APROVAÇÃO ⭐️
      // O script que adicionámos ao index.html cria um input oculto com id='deviceId'
      const deviceIdInput = document.getElementById('deviceId');
      const deviceIdValue = deviceIdInput ? deviceIdInput.value : null;

      if (!deviceIdValue) {
        console.warn("⚠️ Device ID não encontrado. O script de segurança pode não ter carregado a tempo.");
      }

      // 2. CHAMAR O BACKEND DO RAILWAY
      const apiUrl = `${BACKEND_URL}/api/mercadopago/create-preference`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: selectedPlan.id,
          user: {
            email: user.email,
            name: user.displayName || user.email,
            id: user.uid 
          },
          // ⭐️ ADICIONAR O DEVICE ID AO PAYLOAD (Chave para mais aprovação) ⭐️
          deviceId: deviceIdValue 
        })
      });

      if (!response.ok) {
        const err = await response.json();
        console.error("Erro do backend:", err);
        throw new Error('Erro ao criar preferência de pagamento no backend');
      }

      const data = await response.json();
      console.log('✅ Preferência criada:', data.preferenceId);

      // ⭐️ 3. REDIRECIONAR A PÁGINA INTEIRA ⭐️
      window.location.href = data.initPoint;

    } catch (error) {
      console.error('❌ Erro no handleCheckout:', error);
      alert('Erro ao processar pagamento. Tente novamente.');
      setLoading(false);
    }
  };

  if (!selectedPlan) return <div>Carregando...</div>;

  return (
    <div className="checkout-page">
      <div className="checkout-container">
        {/* Header (Mantido) */}
        <div className="checkout-header">
          <button className="btn-back-checkout" onClick={() => navigate('/plans')}>
            ← Voltar para Planos
          </button>
          <h1>Finalizar Assinatura</h1>
        </div>

        <div className="checkout-grid">
          {/* Coluna Esquerda - Resumo do Pedido (Mantido) */}
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
                    <div className="price-installments-checkout">12x de R$ {selectedPlan.pricePerMonth.toFixed(2)}</div>
                    <div className="price-total-checkout">Total: R$ {selectedPlan.price.toFixed(2)}/ano</div>
                  </>
                ) : (
                  <div className="price-main-checkout">
                    R$ {selectedPlan.price.toFixed(2)}
                    <span className="price-period-checkout">/{selectedPlan.id === 'monthly' ? 'mês' : 'ano'}</span>
                  </div>
                )}
              </div>
              {selectedPlan.savings && (<div className="savings-checkout">💰 Você economiza R$ {selectedPlan.savings.toFixed(2)} por ano!</div>)}
              <div className="plan-summary-features">
                <h4>O que está incluído:</h4>
                <ul>
                  {selectedPlan.features.map((feature, idx) => (<li key={idx}>✓ {feature}</li>))}
                </ul>
              </div>
            </div>
            <div className="trial-info-checkout">
              <div className="trial-icon-checkout">🎁</div>
              <div><strong>15 dias grátis</strong><p>O seu plano pago só começará após o fim do seu trial.</p></div>
            </div>
          </div>

          {/* Coluna Direita - Pagamento */}
          <div className="checkout-payment">
            <h2>Método de Pagamento</h2>
            {/* Mantemos as opções de método para UX, mas o MP no redirecionamento gere isso */}
            <div className="payment-methods">
              <label className={`payment-method-option ${paymentMethod === 'credit_card' ? 'selected' : ''}`}>
                <input type="radio" name="paymentMethod" value="credit_card" checked={paymentMethod === 'credit_card'} onChange={(e) => setPaymentMethod(e.target.value)} />
                <div className="payment-method-content">
                  <span className="payment-icon">💳</span>
                  <div><strong>Cartão de Crédito</strong><p>Pagamento seguro via Mercado Pago</p></div>
                </div>
              </label>
              <label className={`payment-method-option ${paymentMethod === 'pix' ? 'selected' : ''}`}>
                <input type="radio" name="paymentMethod" value="pix" checked={paymentMethod === 'pix'} onChange={(e) => setPaymentMethod(e.target.value)} />
                <div className="payment-method-content">
                  <span className="payment-icon">📱</span>
                  <div><strong>PIX</strong><p>Aprovação instantânea</p></div>
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