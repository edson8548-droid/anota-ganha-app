import React, { useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Send, ClipboardList, Puzzle, BarChart3, MessageCircle } from 'lucide-react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuthContext } from '../contexts/AuthContext';
import api from '../services/api';
import './Plans.css';

const Plans = () => {
  const navigate = useNavigate();
  const { subscription, isTrialActive, trialEndsAt, PLANS } = useSubscription();
  const authData = useAuthContext();

  const [loading, setLoading] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  const getTrialDaysLeft = () => {
    if (!isTrialActive || !trialEndsAt) return 0;
    return Math.max(0, Math.ceil((trialEndsAt - new Date()) / (1000 * 60 * 60 * 24)));
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    try {
      const res = await api.post('/license/apply-coupon', { coupon_code: couponCode.trim() });
      toast.success(res.data.message);
      setCouponCode('');
      window.location.reload();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Cupom inválido ou expirado');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleAssinar = (planId) => {
    setLoading(true);
    navigate('/checkout', { state: { planId } });
  };

  const features = [
    { icon: <FileSpreadsheet size={22} color="#3A85A8" />, text: 'Cotação Pronta — planilha preenchida automaticamente' },
    { icon: <Send size={22} color="#3A85A8" />, text: 'Carteira no WhatsApp — envio em massa para seus clientes' },
    { icon: <ClipboardList size={22} color="#3A85A8" />, text: 'Prompts Prontos para RCA — ofertas, planilhas e mensagens' },
    { icon: <Puzzle size={22} color="#3A85A8" />, text: 'Extensão Cotatudo Automático' },
    { icon: <BarChart3 size={22} color="#3A85A8" />, text: 'Raio-X dos Incentivos' },
    { icon: <MessageCircle size={22} color="#3A85A8" />, text: 'Suporte via WhatsApp' },
  ];

  const planCards = [
    {
      ...PLANS.monthly,
      label: 'Mensal',
      priceLine: 'R$ 99,00',
      periodLine: 'por mês',
      note: 'Recorrência mensal. Cancele quando quiser.',
      highlight: false,
    },
    {
      ...PLANS.annual_upfront,
      label: 'Anual',
      priceLine: 'R$ 69,00',
      periodLine: 'por mês',
      note: 'Cobrado anualmente em R$ 828,00.',
      highlight: true,
      badge: 'Melhor custo-benefício',
    },
  ];

  const explicitAccessEnd = subscription?.accessEndsAt?.toDate?.() || (subscription?.accessEndsAt ? new Date(subscription.accessEndsAt) : null);
  const lastPaymentDate = subscription?.lastPaymentDate?.toDate?.() || (subscription?.lastPaymentDate ? new Date(subscription.lastPaymentDate) : null);
  const paidAccessEnd = explicitAccessEnd || (lastPaymentDate ? new Date(lastPaymentDate.getTime() + 30 * 24 * 60 * 60 * 1000) : null);
  const assinaturaAtiva = subscription?.status === 'active'
    || (['canceling', 'canceled'].includes(subscription?.status) && paidAccessEnd && paidAccessEnd > new Date());

  return (
    <div className="plans-page">

      {/* Header */}
      <header style={{
        background: 'rgba(43,45,49,0.95)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #4A4D52', padding: '0 24px', height: 64,
        display: 'flex', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10,
        marginBottom: 32,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 720, margin: '0 auto' }}>
          <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: '1px solid #4A4D52', borderRadius: 8, padding: '6px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#A0A3A8' }}>
            ← Dashboard
          </button>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#ffffff' }}>Planos</span>
        </div>
      </header>

      <div className="plans-content">

      {/* Trial Banner */}
      {isTrialActive && (
        <div className="trial-banner">
          <div className="trial-icon">🎁</div>
          <div className="trial-info">
            <h3>Seu acesso gratuito está ativo</h3>
            <p>Você tem <strong>{getTrialDaysLeft()} dias restantes</strong>. Assine antes de acabar para não perder o acesso.</p>
          </div>
        </div>
      )}

      {/* Planos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, margin: '8px auto 28px', maxWidth: 760 }}>
        {planCards.map(plan => (
          <div key={plan.id} style={{ ...card, borderColor: plan.highlight ? '#3A85A8' : '#4A4D52' }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              {plan.badge && (
                <div style={{ margin: '0 auto 12px', width: 'fit-content', padding: '7px 11px', border: '1px solid rgba(58,133,168,.45)', borderRadius: 999, color: '#DDEFF7', background: 'rgba(58,133,168,.14)', fontSize: 12, fontWeight: 800 }}>
                  {plan.badge}
                </div>
              )}
              <div style={{ fontSize: 13, fontWeight: 800, color: '#3A85A8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                {plan.label}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 8 }}>
                <span style={{ fontSize: 54, fontWeight: 850, color: '#ffffff', lineHeight: 1 }}>{plan.priceLine}</span>
              </div>
              <div style={{ fontSize: 14, color: '#A0A3A8', marginTop: 8 }}>{plan.periodLine}</div>
              <div style={{ fontSize: 13, color: '#A0A3A8', marginTop: 10, minHeight: 38 }}>{plan.note}</div>
            </div>

            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {features.map((f, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, color: '#E1E1E1' }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{f.icon}</span>
                  {f.text}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleAssinar(plan.id)}
              disabled={loading || assinaturaAtiva}
              style={{
                width: '100%', padding: '15px', border: 'none', borderRadius: 10,
                background: assinaturaAtiva ? '#2e3136' : '#3A85A8',
                color: assinaturaAtiva ? '#A0A3A8' : '#fff',
                fontSize: 16, fontWeight: 700, cursor: assinaturaAtiva ? 'default' : 'pointer',
              }}
            >
              {assinaturaAtiva ? '✓ Plano ativo' : loading ? 'Aguarde...' : `Assinar plano ${plan.label.toLowerCase()}`}
            </button>
          </div>
        ))}
      </div>

      {/* Cupom */}
      <div style={couponBox}>
        <span style={{ color: '#A0A3A8', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>Tem um cupom?</span>
        <input
          value={couponCode}
          onChange={e => setCouponCode(e.target.value.toUpperCase())}
          placeholder="Digite o código"
          onKeyDown={e => e.key === 'Enter' && handleApplyCoupon()}
          style={couponInput}
        />
        <button
          onClick={handleApplyCoupon}
          disabled={!couponCode.trim() || couponLoading}
          style={{ ...btnCoupon, opacity: !couponCode.trim() ? 0.5 : 1 }}
        >
          {couponLoading ? 'Aplicando...' : 'Aplicar'}
        </button>
      </div>

      {/* Footer */}
      <div className="plans-footer">
        <p>🔒 Pagamento seguro via Asaas</p>
        <p>✉️ Dúvidas? Entre em contato: suporte@venpro.com.br</p>
      </div>

      </div>{/* /plans-content */}
    </div>
  );
};

const card = {
  background: '#363940', border: '1px solid #3A85A8', borderRadius: 20,
  padding: '36px 30px', width: '100%',
  boxShadow: '0 0 40px rgba(58,133,168,0.15)',
};
const couponBox = {
  display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
  background: '#363940', border: '1px solid #4A4D52', borderRadius: 12,
  padding: '16px 20px', marginBottom: 28,
  maxWidth: 440, width: '100%', margin: '0 auto 28px',
};
const couponInput = {
  flex: 1, minWidth: 160, padding: '10px 14px', borderRadius: 8,
  border: '1px solid #4A4D52', background: '#2B2D31', color: '#E1E1E1',
  fontSize: 14, fontFamily: 'monospace', letterSpacing: 1, outline: 'none',
};
const btnCoupon = {
  padding: '10px 20px', borderRadius: 8, border: 'none',
  background: '#3A85A8', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
};

export default Plans;
