import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export default function PaymentSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    toast.success('Pagamento aprovado com sucesso!');
  }, []);

  const paymentId = searchParams.get('payment_id');
  const status = searchParams.get('status');

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 text-center">
        <div className="mb-6">
          <CheckCircle className="w-24 h-24 text-green-500 mx-auto animate-bounce" />
        </div>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Pagamento Aprovado! 🎉
        </h1>

        <p className="text-gray-600 dark:text-gray-300 mb-6">
          Sua assinatura foi ativada com sucesso. Agora você tem acesso completo a todas as funcionalidades do aplicativo!
        </p>

        {paymentId && (
          <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              ID do Pagamento
            </p>
            <p className="text-sm font-mono text-gray-900 dark:text-white">
              {paymentId}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors"
          >
            Ir para o Dashboard
            <ArrowRight className="w-5 h-5 ml-2" />
          </button>

          <button
            onClick={() => navigate('/pricing')}
            className="w-full px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-xl font-semibold transition-colors"
          >
            Ver Planos
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mt-6">
          ✉️ Você receberá um email de confirmação em breve
        </p>
      </div>
    </div>
  );
}
