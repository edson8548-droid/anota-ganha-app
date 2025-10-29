import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { XCircle, ArrowLeft, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';

export default function PaymentFailure() {
  const navigate = useNavigate();

  useEffect(() => {
    toast.error('Pagamento não aprovado');
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 text-center">
        <div className="mb-6">
          <XCircle className="w-24 h-24 text-red-500 mx-auto" />
        </div>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Pagamento Não Aprovado
        </h1>

        <p className="text-gray-600 dark:text-gray-300 mb-6">
          Não foi possível processar seu pagamento. Isso pode ter acontecido por diversos motivos, como dados incorretos ou saldo insuficiente.
        </p>

        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <p className="text-sm text-red-800 dark:text-red-300 font-semibold mb-2">
            O que fazer?
          </p>
          <ul className="text-sm text-red-700 dark:text-red-400 text-left space-y-1">
            <li>• Verifique os dados do seu cartão</li>
            <li>• Certifique-se de ter saldo disponível</li>
            <li>• Tente outro método de pagamento</li>
            <li>• Entre em contato com seu banco</li>
          </ul>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => navigate('/pricing')}
            className="w-full flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors"
          >
            <RefreshCcw className="w-5 h-5 mr-2" />
            Tentar Novamente
          </button>

          <button
            onClick={() => navigate('/dashboard')}
            className="w-full flex items-center justify-center px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-xl font-semibold transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Voltar ao Dashboard
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mt-6">
          💬 Precisa de ajuda? Entre em contato conosco
        </p>
      </div>
    </div>
  );
}
