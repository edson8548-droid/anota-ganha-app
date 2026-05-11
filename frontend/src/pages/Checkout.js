import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuthContext } from '../contexts/AuthContext';
import { apiUrl, backendUrl } from '../config/api';
import { auth, db } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import './Checkout.css';

const onlyDigits = (value) => String(value || '').replace(/\D/g, '');

const formatCpf = (value) => {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

const formatPhone = (value) => {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
};

const formatMoney = (value) => Number(value || 0).toLocaleString('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const isValidCpf = (cpf) => {
  const digits = onlyDigits(cpf);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  const calcDigit = (base) => {
    let sum = 0;
    for (let i = 0; i < base.length; i += 1) {
      sum += Number(base[i]) * (base.length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  const d1 = calcDigit(digits.slice(0, 9));
  const d2 = calcDigit(digits.slice(0, 10));
  return d1 === Number(digits[9]) && d2 === Number(digits[10]);
};

const Checkout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { PLANS } = useSubscription();
  const authData = useAuthContext();
  const user = authData?.user;

  const [selectedPlan, setSelectedPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [payerData, setPayerData] = useState({ name: '', cpf: '', telefone: '' });

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

  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.uid) {
        setProfileLoading(false);
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const data = userDoc.exists() ? userDoc.data() : {};
        setPayerData({
          name: data.name || data.displayName || data.nome || user.displayName || user.email || '',
          cpf: formatCpf(data.cpf || data.cpfCnpj || ''),
          telefone: formatPhone(data.telefone || data.phone || '')
        });
      } catch (error) {
        console.error('Erro ao carregar dados do pagador:', error);
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, [user]);
  

  // ============================================
  // PROCESSAR PAGAMENTO (AGORA COM SDK POLLER)
  // ============================================
  const handleCheckout = async () => {
    if (!selectedPlan || !user) {
      toast.warning('⚠️ Erro ao processar pagamento. Tente novamente.');
      return;
    }

    const cleanCpf = onlyDigits(payerData.cpf);
    const cleanPhone = onlyDigits(payerData.telefone);
    const payerName = payerData.name.trim();

    if (!payerName) {
      toast.warning('Informe seu nome completo antes de continuar.');
      return;
    }

    if (!isValidCpf(cleanCpf)) {
      toast.warning('Informe um CPF válido antes de continuar.');
      return;
    }

    if (cleanPhone.length < 10) {
      toast.warning('Informe um telefone válido com DDD.');
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

      await setDoc(doc(db, 'users', user.uid), {
        name: payerName,
        cpf: cleanCpf,
        telefone: cleanPhone,
        updated_at: new Date()
      }, { merge: true });

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
              {selectedPlan.period === 'annual' ? (
                <>
                  <div className="price-main-checkout">
                    R$ {formatMoney(selectedPlan.pricePerMonth)}
                    <span className="price-period-checkout">/mês</span>
                  </div>
                  <div className="price-total-checkout">Cobrado anualmente: R$ {formatMoney(selectedPlan.price)}/ano</div>
                </>
              ) : (
                <>
                  <div className="price-main-checkout">
                    R$ {formatMoney(selectedPlan.price)}
                    <span className="price-period-checkout">/mês</span>
                  </div>
                </>
              )}
              <div className="trial-info-checkout" style={{ marginTop: 12 }}>
                <div>
                  <strong>{selectedPlan.displayName}</strong>
                  <p>{selectedPlan.billingCycle}</p>
                </div>
              </div>
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
            <div className="payer-form">
              <label>
                <span>Nome completo</span>
                <input
                  value={payerData.name}
                  onChange={(e) => setPayerData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Digite seu nome completo"
                  disabled={profileLoading || loading}
                />
              </label>
              <label>
                <span>CPF</span>
                <input
                  value={payerData.cpf}
                  onChange={(e) => setPayerData((prev) => ({ ...prev, cpf: formatCpf(e.target.value) }))}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  disabled={profileLoading || loading}
                />
              </label>
              <label>
                <span>Telefone com DDD</span>
                <input
                  value={payerData.telefone}
                  onChange={(e) => setPayerData((prev) => ({ ...prev, telefone: formatPhone(e.target.value) }))}
                  placeholder="(00) 00000-0000"
                  inputMode="tel"
                  disabled={profileLoading || loading}
                />
              </label>
              <p>Esses dados são usados apenas para gerar a cobrança segura no Asaas.</p>
            </div>
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
            <button className="btn-checkout" onClick={handleCheckout} disabled={loading || profileLoading}>
              {loading ? 'Processando...' : profileLoading ? 'Carregando dados...' : 'Continuar para pagamento'}
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
