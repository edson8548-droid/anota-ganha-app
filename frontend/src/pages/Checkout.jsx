import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuthContext } from '../contexts/AuthContext';
import { apiUrl, backendUrl } from '../config/api';
import { saveBillingProfile } from '../services/api';
import { auth, db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { isValidCpfCnpj } from '../utils/documentValidators';
import { getPartnerCouponDiscount, normalizePartnerCode } from '../utils/partnerProgram';
import './Checkout.css';

const onlyDigits = (value) => String(value || '').replace(/\D/g, '');

const formatCpfCnpj = (value) => {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
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
  const [couponCode, setCouponCode] = useState('');

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
        const storedCoupon = (() => {
          try {
            return normalizePartnerCode(localStorage.getItem('venpro:checkout-coupon'));
          } catch {
            return '';
          }
        })();
        const profileCoupon = normalizePartnerCode(
          location.state?.couponCode
          || storedCoupon
          || data.referredByCode
          || data.referralCode
        );
        if (profileCoupon) setCouponCode(profileCoupon);
        setPayerData({
          name: data.name || data.displayName || data.nome || user.displayName || user.email || '',
          cpf: formatCpfCnpj(data.cpfCnpj || data.cpf || data.cnpj || ''),
          telefone: formatPhone(data.telefone || data.phone || '')
        });
      } catch (error) {
        console.error('Erro ao carregar dados do pagador:', error);
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, [user, location.state?.couponCode]);

  const normalizedCouponCode = normalizePartnerCode(couponCode);
  const partnerDiscount = selectedPlan
    ? getPartnerCouponDiscount(selectedPlan.price, normalizedCouponCode)
    : null;
  const finalPrice = partnerDiscount?.finalPrice || selectedPlan?.price || 0;
  

  // ============================================
  // PROCESSAR PAGAMENTO (AGORA COM SDK POLLER)
  // ============================================
  const handleCheckout = async () => {
    if (!selectedPlan || !user) {
      toast.warning('⚠️ Erro ao processar pagamento. Tente novamente.');
      return;
    }

    const cleanCpfCnpj = onlyDigits(payerData.cpf);
    const cleanPhone = onlyDigits(payerData.telefone);
    const payerName = payerData.name.trim();

    if (!payerName) {
      toast.warning('Informe seu nome completo antes de continuar.');
      return;
    }

    if (!isValidCpfCnpj(cleanCpfCnpj)) {
      toast.warning('Informe um CPF ou CNPJ válido antes de continuar.');
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

      await saveBillingProfile({
        name: payerName,
        cpf: cleanCpfCnpj,
        cpfCnpj: cleanCpfCnpj,
        telefone: cleanPhone,
      });

      const response = await fetch(apiUrl('/asaas/create-subscription'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          planId: selectedPlan.id,
          ...(normalizedCouponCode ? { couponCode: normalizedCouponCode } : {})
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
              {partnerDiscount ? (
                <>
                  <div className="price-total-checkout" style={{ textDecoration: 'line-through', opacity: .7 }}>
                    Plano normal R$ {formatMoney(selectedPlan.price)}/mês
                  </div>
                  <div className="checkout-discount-line">
                    Cupom {partnerDiscount.code}: -R$ {formatMoney(partnerDiscount.discountAmount)}
                  </div>
                </>
              ) : null}
              <div className="price-main-checkout">
                R$ {formatMoney(finalPrice)}
                <span className="price-period-checkout">/mês</span>
              </div>
              <div className="trial-info-checkout" style={{ marginTop: 12 }}>
                <div>
                  <strong>Preço de lançamento por tempo limitado</strong>
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
                <strong>15 dias grátis sem cartão</strong>
                <p>Você só paga se concluir a cobrança no Asaas.</p>
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
                <span>CPF ou CNPJ</span>
                <input
                  value={payerData.cpf}
                  onChange={(e) => setPayerData((prev) => ({ ...prev, cpf: formatCpfCnpj(e.target.value) }))}
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
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
            <div className="payer-form checkout-coupon-form">
              <label>
                <span>Cupom de parceiro</span>
                <input
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  placeholder="Ex: carlos14off"
                  disabled={loading}
                />
              </label>
              {partnerDiscount ? (
                <p>Cupom aplicado. A cobrança no Asaas será de R$ {formatMoney(partnerDiscount.finalPrice)} por mês.</p>
              ) : (
                <p>Se entrou por indicação, o cupom pode aparecer preenchido automaticamente.</p>
              )}
            </div>
            <div className="payment-methods">
              <label className="payment-method-option selected">
                <input type="radio" name="paymentMethod" value="asaas" checked readOnly />
                <div className="payment-method-content">
                  <span className="payment-icon">💳</span>
                  <div>
                    <strong>Assinatura mensal segura</strong>
                    <p>No cartão, a cobrança fica automática todo mês. Pix e boleto continuam disponíveis pelo Asaas.</p>
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
