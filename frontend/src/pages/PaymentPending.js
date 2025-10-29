import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function PaymentPending() {
  const navigate = useNavigate();

  useEffect(() => {
    toast.info('Pagamento em processamento');
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 text-center">
        <div className="mb-6">
          <Clock className="w-24 h-24 text-yellow-500 mx-auto animate-pulse" />
        </div>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Pagamento em Processamento
        </h1>

        <p className="text-gray-600 dark:text-gray-300 mb-6">
          Seu pagamento está sendo processado. Isso pode levar alguns minutos. Você receberá uma notificação assim que for confirmado.
        </p>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800 dark:text-yellow-300 font-semibold mb-2">
            ⏳ O que acontece agora?
          </p>
          <ul className="text-sm text-yellow-700 dark:text-yellow-400 text-left space-y-2">
            <li>• Aguarde a confirmação do pagamento</li>
            <li>• Você receberá um email quando for aprovado</li>
            <li>• O acesso será liberado automaticamente</li>
            <li>• Pode levar até 2 dias úteis (boleto)</li>
          </ul>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Voltar ao Dashboard
          </button>

          <button
            onClick={() => navigate('/pricing')}
            className="w-full px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-xl font-semibold transition-colors"
          >
            Ver Planos
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mt-6">
          📧 Acompanhe o status pelo seu email
        </p>
      </div>
    </div>
  );
}
