import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuthContext } from '../contexts/AuthContext';
import { apiUrl, backendUrl } from '../config/api';
import { auth } from '../firebase/config';
import './Checkout.css';

const Checkout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { PLANS } = useSubscription();
  const authData = useAuthContext();
  const user = authData?.user;

  const [selectedPlan, setSelectedPlan] = useState(null);
  const [loading, setLoading] = useState(false);

  // Carregar plano selecionado (Mantido)
  useEffect(() => {
    const planId = location.state?.planId;
    if (planId && PLANS[planId]) {
      setSelectedPlan(PLANS[planId]);
    } else {
      navigate('/plans');
    }
  }, [location, PLANS, navigate]);

  useEffect(() => {
    fetch(backendUrl('/health'), { method: 'GET', mode: 'cors' }).catch(() => {});
  }, []);
  

  // ============================================
  // PROCESSAR PAGAMENTO (AGORA COM SDK POLLER)
  // ============================================
  const handleCheckout = async () => {
    if (!selectedPlan || !user) {
      toast.warning('⚠️ Erro ao processar pagamento. Tente novamente.');
      return;
    }

    setLoading(true);

    try {
      const token = await auth.currentUser?.getIdToken();

      if (!token) {
        throw new Error('Sessão expirada. Faça login novamente.');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      const response = await fetch(apiUrl('/asaas/create-subscription'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          planId: selectedPlan.id
        })
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = await response.json();
        console.error("Erro do backend (500):", err);
        throw new Error(`Erro do servidor: ${err.detail || response.statusText}`);
      }

      const data = await response.json();
      const paymentUrl = data.paymentUrl || data.invoiceUrl;
      if (!paymentUrl) {
        throw new Error('O Asaas não retornou o link de pagamento.');
      }

      window.location.href = paymentUrl;

    } catch (error) {
      console.error('❌ Erro no handleCheckout:', error);
      const message = error.name === 'AbortError'
        ? 'O pagamento demorou para responder. Tente novamente em alguns segundos.'
        : error.message || 'Erro ao processar pagamento. Tente novamente.';
      toast.warning(message);
      setLoading(false);
    }
  };

  if (!selectedPlan) return (
    <div style={{ minHeight: '100vh', background: '#2B2D31', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#363940', border: '1px solid #4A4D52', borderRadius: 16, padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 14, width: 320 }}>
        <span className="skeleton" style={{ height: 18, width: '55%' }} />
        <span className="skeleton" style={{ height: 40, width: '100%' }} />
        <span className="skeleton" style={{ height: 14, width: '70%' }} />
      </div>
    </div>
  );

  return (
    <div className="checkout-page">

      {/* Header padrão sticky */}
      <header className="checkout-header-bar">
        <div className="checkout-header-inner">
          <button className="btn-back-checkout" onClick={() => navigate('/plans')}>
            ← Planos
          </button>
          <span className="checkout-header-title">Finalizar Assinatura</span>
        </div>
      </header>

      <div className="checkout-body">
        <div className="checkout-grid">

          {/* Coluna Esquerda — Resumo */}
          <div className="checkout-card">
            <h2>Resumo do Pedido</h2>
            <p className="plan-summary-name">{selectedPlan.name}</p>
            <div className="plan-summary-price-block">
              {selectedPlan.id === 'annual_installments' ? (
                <>
                  <div className="price-installments-checkout">12x de R$ {selectedPlan.pricePerMonth.toFixed(2)}</div>
                  <div className="price-total-checkout">Total R$ {selectedPlan.price.toFixed(2)}/ano</div>
                </>
              ) : (
                <>
                  <div className="price-total-checkout" style={{ textDecoration: 'line-through', opacity: .7 }}>
                    De R$ 99,90/mês
                  </div>
                  <div className="price-main-checkout">
                    R$ {selectedPlan.price.toFixed(2)}
                    <span className="price-period-checkout">/{selectedPlan.id === 'monthly' ? 'mês' : 'ano'}</span>
                  </div>
                  <div className="trial-info-checkout" style={{ marginTop: 12 }}>
                    <div>
                      <strong>Preço de lançamento por tempo limitado</strong>
                      <p>Recorrente até cancelar. Você pode cancelar quando quiser.</p>
                    </div>
                  </div>
                </>
              )}
            </div>
            {selectedPlan.savings && (
              <div className="savings-checkout">Economize R$ {selectedPlan.savings.toFixed(2)} por ano</div>
            )}
            <div className="plan-summary-features">
              <h4>Incluído no plano</h4>
              <ul>
                {selectedPlan.features.map((feature, idx) => <li key={idx}>{feature}</li>)}
              </ul>
            </div>
            <div className="trial-info-checkout">
              <div className="trial-icon-checkout">🎁</div>
              <div>
                <strong>15 dias grátis</strong>
                <p>O plano pago começa após o trial.</p>
              </div>
            </div>
          </div>

          {/* Coluna Direita — Pagamento */}
          <div className="checkout-card">
            <h2>Método de Pagamento</h2>
            <div className="payment-methods">
              <label className="payment-method-option selected">
                <input type="radio" name="paymentMethod" value="asaas" checked readOnly />
                <div className="payment-method-content">
                  <span className="payment-icon">💳</span>
                  <div>
                    <strong>Assinatura recorrente até cancelar</strong>
                    <p>Pagamento seguro via Asaas. Escolha cartão, Pix ou boleto na próxima tela.</p>
                  </div>
                </div>
              </label>
            </div>
            <button className="btn-checkout" onClick={handleCheckout} disabled={loading}>
              {loading ? 'Processando...' : 'Continuar para pagamento'}
            </button>
            <div className="security-badges">
              <p>🔒 Pagamento 100% seguro</p>
              <p>✓ Criptografia SSL</p>
              <p>✓ Dados protegidos pelo Asaas</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Checkout;
