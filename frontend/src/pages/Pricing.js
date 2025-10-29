import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { CreditCard, Check, ArrowLeft, Clock, Zap } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

export default function Pricing() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  const plans = [
    {
      id: 'monthly_simple',
      name: 'Mensal Flexível',
      price: 35.00,
      interval: 'mês',
      billingInfo: 'Sem compromisso - Cancele quando quiser',
      features: [
        'Campanhas ilimitadas',
        'Clientes ilimitados',
        'Relatórios por cidade',
        'Suporte via email',
        'Acesso completo ao app',
        '✅ Cancele a qualquer momento',
        '🔄 Renovação automática'
      ],
      popular: false,
      flexible: true
    },
    {
      id: 'monthly',
      name: 'Mensal 12 meses',
      price: 29.90,
      totalYear: 358.80,
      interval: '12x de R$ 29,90',
      billingInfo: 'Cobrado mensalmente por 12 meses',
      features: [
        'Campanhas ilimitadas',
        'Clientes ilimitados',
        'Relatórios por cidade',
        'Suporte via email',
        'Acesso completo ao app',
        '💰 R$ 5,10 mais barato por mês',
        '🔄 Renovação automática'
      ],
      popular: true,
      recommended: '✨ Melhor Valor'
    },
    {
      id: 'annual',
      name: 'Anual',
      price: 300.00,
      originalPrice: 420.00,
      interval: 'ano',
      billingInfo: 'Pagamento único anual',
      discount: '💰 Economize R$ 120/ano',
      features: [
        'Campanhas ilimitadas',
        'Clientes ilimitados',
        'Relatórios por cidade',
        'Suporte prioritário',
        'Acesso completo ao app',
        '💵 Máxima economia',
        '🔄 Renovação automática'
      ],
      popular: false
    }
  ];

  const handleSelectPlan = async (planId) => {
    if (!user) {
      toast.error('Você precisa estar logado');
      navigate('/login');
      return;
    }

    setSelectedPlan(planId);
    setLoading(true);

    try {
      // Criar assinatura sem cartão - redirecionar para Mercado Pago
      const response = await axios.post(
        `${API_URL}/subscriptions/create`,
        {
          card_token: '', // Não precisa mais de token
          plan_type: planId,
          payer_email: user.email
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      const { init_point } = response.data;

      if (init_point) {
        // Redirecionar para Mercado Pago para cadastrar cartão
        toast.info('Redirecionando para pagamento seguro...');
        setTimeout(() => {
          window.location.href = init_point;
        }, 1000);
      } else {
        toast.error('Erro ao criar assinatura. Tente novamente.');
        setLoading(false);
      }

    } catch (error) {
      console.error('Erro ao criar assinatura:', error);
      const errorMessage = error.response?.data?.detail || 'Erro ao processar. Tente novamente.';
      toast.error(errorMessage);
      setLoading(false);
      setSelectedPlan(null);
    }
  };

  const handlePayWithPix = async (planId) => {
    if (!user) {
      toast.error('Você precisa estar logado');
      navigate('/login');
      return;
    }

    setSelectedPlan(planId);
    setLoading(true);

    try {
      // Criar preferência de pagamento (suporta Pix, cartão, boleto)
      const response = await axios.post(
        `${API_URL}/payments/create-preference`,
        {
          plan: planId,
          payer_email: user.email,
          payer_name: user.name || user.email
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      const { init_point } = response.data;

      if (init_point) {
        toast.success('Redirecionando para pagamento...');
        setTimeout(() => {
          window.location.href = init_point;
        }, 1000);
      } else {
        toast.error('Erro ao criar pagamento. Tente novamente.');
        setLoading(false);
      }

    } catch (error) {
      console.error('Erro ao criar pagamento:', error);
      const errorMessage = error.response?.data?.detail || 'Erro ao processar. Tente novamente.';
      toast.error(errorMessage);
      setLoading(false);
      setSelectedPlan(null);
    }
  };

  const getLicenseInfo = () => {
    if (!user) return null;

    const { license_type, license_expiry } = user;
    
    if (license_type === 'trial') {
      const daysRemaining = license_expiry 
        ? Math.ceil((new Date(license_expiry) - new Date()) / (1000 * 60 * 60 * 24))
        : 0;
      
      return {
        type: 'trial',
        message: `Período de teste: ${daysRemaining} dias restantes`,
        color: 'bg-yellow-100 text-yellow-800 border-yellow-300'
      };
    }

    if (license_type === 'monthly' || license_type === 'annual') {
      return {
        type: 'active',
        message: `Plano ${license_type === 'monthly' ? 'Mensal' : 'Anual'} ativo`,
        color: 'bg-green-100 text-green-800 border-green-300'
      };
    }

    if (license_type === 'expired') {
      return {
        type: 'expired',
        message: 'Seu período de teste expirou',
        color: 'bg-red-100 text-red-800 border-red-300'
      };
    }

    return null;
  };

  const licenseInfo = getLicenseInfo();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center text-blue-600 hover:text-blue-700 mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Voltar ao Dashboard
          </button>

          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              Escolha seu Plano
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Selecione o plano ideal para o seu negócio
            </p>

            {/* License Status Badge */}
            {licenseInfo && (
              <div className={`inline-flex items-center px-4 py-2 rounded-full border-2 mt-4 ${licenseInfo.color}`}>
                {licenseInfo.type === 'active' && <Check className="w-5 h-5 mr-2" />}
                {licenseInfo.type === 'trial' && <Clock className="w-5 h-5 mr-2" />}
                <span className="font-semibold">{licenseInfo.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* Plans Grid */}
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden transition-all duration-300 hover:shadow-2xl hover:scale-105 ${
                plan.popular ? 'ring-4 ring-blue-500' : ''
              }`}
            >
              {/* Popular/Recommended/Flexible Badge */}
              {plan.popular && plan.recommended && (
                <div className="absolute top-0 right-0 bg-gradient-to-r from-yellow-400 to-yellow-500 text-gray-900 px-4 py-1 rounded-bl-lg font-bold shadow-lg">
                  <Zap className="inline w-4 h-4 mr-1" />
                  {plan.recommended}
                </div>
              )}
              {plan.popular && !plan.recommended && (
                <div className="absolute top-0 right-0 bg-blue-500 text-white px-4 py-1 rounded-bl-lg font-semibold">
                  <Zap className="inline w-4 h-4 mr-1" />
                  Mais Popular
                </div>
              )}
              {plan.flexible && (
                <div className="absolute top-0 right-0 bg-gradient-to-r from-green-400 to-green-500 text-white px-4 py-1 rounded-bl-lg font-bold shadow-lg">
                  ✅ Sem Compromisso
                </div>
              )}

              <div className="p-8">
                {/* Plan Header */}
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline">
                    {plan.id === 'monthly' ? (
                      <>
                        <span className="text-5xl font-extrabold text-gray-900 dark:text-white">
                          R$ {plan.price.toFixed(2)}
                        </span>
                        <span className="text-xl text-gray-500 dark:text-gray-400 ml-2">
                          /mês
                        </span>
                      </>
                    ) : (
                      <span className="text-5xl font-extrabold text-gray-900 dark:text-white">
                        R$ {plan.price.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    {plan.billingInfo}
                  </p>
                  {plan.totalYear && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 font-medium">
                      Total: R$ {plan.totalYear.toFixed(2)}/ano
                    </p>
                  )}
                  {plan.originalPrice && (
                    <div className="mt-2">
                      <span className="text-gray-500 line-through">
                        R$ {plan.originalPrice.toFixed(2)}
                      </span>
                      <span className="ml-2 text-green-600 font-semibold">
                        {plan.discount}
                      </span>
                    </div>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start">
                      <Check className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA Buttons */}
                <div className="space-y-3">
                  <button
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={loading && selectedPlan === plan.id}
                    className={`w-full py-4 px-6 rounded-xl font-bold text-lg transition-all duration-300 flex items-center justify-center ${
                      plan.popular
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl'
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white'
                    } ${loading && selectedPlan === plan.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {loading && selectedPlan === plan.id ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        Processando...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-5 h-5 mr-2" />
                        Assinar com Cartão
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handlePayWithPix(plan.id)}
                    disabled={loading && selectedPlan === plan.id}
                    className="w-full py-4 px-6 rounded-xl font-bold text-lg transition-all duration-300 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading && selectedPlan === plan.id ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        Processando...
                      </>
                    ) : (
                      <>
                        <span className="text-xl mr-2">🔑</span>
                        Pagar com Pix
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Additional Info */}
        <div className="max-w-3xl mx-auto text-center text-gray-600 dark:text-gray-400">
          <p className="mb-2">
            🔒 Pagamento 100% seguro através do Mercado Pago
          </p>
          <p className="mb-2">
            ✅ Cancele a qualquer momento sem multa
          </p>
          <p>
            📧 Dúvidas? Entre em contato conosco
          </p>
        </div>
      </div>
    </div>
  );
}