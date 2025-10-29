import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { ArrowLeft, Calendar, CreditCard, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

export default function MySubscription() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      const response = await axios.get(`${API_URL}/subscriptions/status`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.data.has_subscription) {
        setSubscription(response.data.subscription);
      }
    } catch (error) {
      console.error('Erro ao carregar assinatura:', error);
      toast.error('Erro ao carregar dados da assinatura');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!window.confirm('Tem certeza que deseja cancelar sua assinatura? Você perderá acesso ao sistema após o período atual.')) {
      return;
    }

    setCanceling(true);

    try {
      await axios.delete(`${API_URL}/subscriptions/cancel`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });

      toast.success('Assinatura cancelada com sucesso!');
      
      // Recarregar dados
      await loadSubscription();
      await refreshUser();

    } catch (error) {
      console.error('Erro ao cancelar assinatura:', error);
      toast.error(error.response?.data?.detail || 'Erro ao cancelar assinatura');
    } finally {
      setCanceling(false);
    }
  };

  const getPlanName = (planType) => {
    const plans = {
      'monthly_simple': 'Mensal Flexível (R$ 35/mês)',
      'monthly': 'Mensal 12 meses (12x R$ 29,90)',
      'annual': 'Anual (R$ 300/ano)'
    };
    return plans[planType] || 'Plano Desconhecido';
  };

  const getStatusBadge = (status) => {
    const badges = {
      'authorized': { icon: CheckCircle, text: 'Ativa', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
      'pending': { icon: AlertCircle, text: 'Pendente', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
      'cancelled': { icon: XCircle, text: 'Cancelada', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' }
    };

    const badge = badges[status] || badges['pending'];
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${badge.color}`}>
        <Icon className="w-4 h-4 mr-1" />
        {badge.text}
      </span>
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/')}
            className="flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Voltar ao Dashboard
          </button>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            Minha Assinatura
          </h1>
        </div>

        {/* Subscription Info */}
        {subscription ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 space-y-6">
            {/* Status */}
            <div className="flex items-center justify-between pb-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Status da Assinatura
              </h2>
              {getStatusBadge(subscription.status)}
            </div>

            {/* Plan Details */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Plano Contratado</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                    <CreditCard className="w-5 h-5 mr-2 text-blue-600" />
                    {getPlanName(subscription.plan_type)}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Valor</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    R$ {subscription.amount?.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Cobrança: {subscription.frequency}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Data de Início</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                    <Calendar className="w-5 h-5 mr-2 text-green-600" />
                    {formatDate(subscription.created_at)}
                  </p>
                </div>

                {subscription.next_payment_date && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Próxima Cobrança</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                      <Calendar className="w-5 h-5 mr-2 text-orange-600" />
                      {formatDate(subscription.next_payment_date)}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* License Info */}
            {user && (
              <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Informações da Licença</p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de Licença</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {user.license_type === 'trial' ? 'Período de Teste' : 
                       user.license_type === 'monthly' ? 'Mensal' :
                       user.license_type === 'annual' ? 'Anual' : 'Ativo'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Validade</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {user.license_expiry ? formatDate(user.license_expiry) : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Cancel Button */}
            {subscription.status === 'authorized' && (
              <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={handleCancelSubscription}
                  disabled={canceling}
                  className="w-full md:w-auto px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {canceling ? 'Cancelando...' : 'Cancelar Assinatura'}
                </button>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  Ao cancelar, você terá acesso até o final do período pago atual.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-12 text-center">
            <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Nenhuma Assinatura Ativa
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Você ainda não possui uma assinatura ativa. Escolha um plano para continuar.
            </p>
            <button
              onClick={() => navigate('/pricing')}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
            >
              Ver Planos Disponíveis
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
