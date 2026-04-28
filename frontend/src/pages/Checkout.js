// SUBSTITUA: src/pages/Checkout.js
// ⭐️ CORREÇÃO: Usa o SDK principal ('sdk.mercadopago.com/js/v2') para obter o Device ID.

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuthContext } from '../contexts/AuthContext';
import './Checkout.css';

// VARIÁVEIS DE PRODUÇÃO (Mantidas)
const BACKEND_URL = "https://anota-ganha-app-production.up.railway.app";
const MERCADOPAGO_PUBLIC_KEY = "APP_USR-5f6e941d-3514-489a-9241-d8a42099b2d0";


// ⭐️ NOVA FUNÇÃO HELPER: Espera o SDK e obtém o Device ID ⭐️
/**
 * Tenta obter o deviceId a partir do SDK (window.mpInstance)
 * @returns {Promise<string|null>} O valor do deviceId ou null se expirar.
 */
const getDeviceIdFromSDK = () => {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const maxWaitTime = 4000; // Espera no máximo 4 segundos

    const check = () => {
      // Verifica se a instância do SDK (mpInstance) está pronta E se a função getDeviceID existe
      if (window.mpInstance && window.mpInstance.getDeviceID) {
        
        // Tenta obter o ID. A função pode demorar um pouco para estar pronta.
        const deviceId = window.mpInstance.getDeviceID();
        
        if (deviceId) {
            console.log("✅ Device ID capturado do SDK:", deviceId);
            resolve(deviceId);
        } else {
            // SDK está pronto, mas a função ainda não retornou um ID, tenta de novo
            setTimeout(check, 100);
        }
      } 
      // Se o tempo máximo de espera foi atingido
      else if (Date.now() - startTime > maxWaitTime) {
        console.warn("⚠️ Instância do MP SDK não carregou após 4s.");
        resolve(null); // Resolve com null após o timeout
      } 
      // Se ainda não encontrou, tenta novamente em 100ms
      else {
        setTimeout(check, 100); 
      }
    };
    check(); // Inicia a verificação
  });
};


const Checkout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { PLANS } = useSubscription();
  const authData = useAuthContext();
  const user = authData?.user;

  const [selectedPlan, setSelectedPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('credit_card');

  // Carregar plano selecionado (Mantido)
  useEffect(() => {
    const planId = location.state?.planId;
    if (planId && PLANS[planId]) {
      setSelectedPlan(PLANS[planId]);
    } else {
      navigate('/plans');
    }
  }, [location, PLANS, navigate]);

  // ⭐️ EFEITO RESTAURADO: Carrega o SDK principal do Mercado Pago ⭐️
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    document.body.appendChild(script);

    script.onload = () => {
      try {
        // Esta é a chave: 'mpInstance' é criada QUANDO o script carrega
        window.mpInstance = new window.MercadoPago(MERCADOPAGO_PUBLIC_KEY, { locale: 'pt-BR' });
        console.log("✅ MP SDK (mpInstance) inicializado.");
      } catch (e) {
        console.error("Falha ao inicializar MP:", e);
      }
    };
    return () => {
      // Limpa ao sair da página
      if (document.body.contains(script)) { document.body.removeChild(script); }
      if (window.mpInstance) {
        delete window.mpInstance;
      }
    };
  }, []); // Vazio, carrega uma vez

  // ⭐️ EFEITO REMOVIDO: O script 'security.js' foi removido.
  

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
      // ⭐️ PASSO 1: ESPERAR E CAPTURAR O DEVICE ID (do SDK) ⭐️
      // A função 'await' vai pausar o 'handleCheckout' até o ID ser encontrado ou o tempo esgotar.
      const deviceIdValue = await getDeviceIdFromSDK();

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
          // Envia o deviceId (seja o valor ou null)
          deviceId: deviceIdValue 
        })
      });

      if (!response.ok) {
        const err = await response.json();
        console.error("Erro do backend (500):", err);
        throw new Error(`Erro do servidor: ${err.detail || response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Preferência criada:', data.preferenceId);

      // ⭐️ 3. REDIRECIONAR A PÁGINA INTEIRA ⭐️
      window.location.href = data.initPoint;

    } catch (error) {
      console.error('❌ Erro no handleCheckout:', error);
      toast.warning('Erro ao processar pagamento. Tente novamente.');
      setLoading(false);
    }
  };

  if (!selectedPlan) return (
    <div style={{
      minHeight: '100vh', background: '#2B2D31',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#363940', border: '1px solid #4A4D52', borderRadius: 16,
        padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 14, width: 320,
      }}>
        <span className="skeleton" style={{ height: 18, width: '55%', borderRadius: 6 }} />
        <span className="skeleton" style={{ height: 40, width: '100%', borderRadius: 8 }} />
        <span className="skeleton" style={{ height: 14, width: '70%', borderRadius: 6 }} />
      </div>
    </div>
  );

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