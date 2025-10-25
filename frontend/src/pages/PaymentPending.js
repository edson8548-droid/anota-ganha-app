1|import React, { useEffect } from 'react';
2|import { useNavigate } from 'react-router-dom';
3|import { Clock, ArrowLeft } from 'lucide-react';
4|import { toast } from 'sonner';
5|
6|export default function PaymentPending() {
7|  const navigate = useNavigate();
8|
9|  useEffect(() => {
10|    toast.info('Pagamento em processamento');
11|  }, []);
12|
13|  return (
14|    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
15|      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 text-center">
16|        <div className="mb-6">
17|          <Clock className="w-24 h-24 text-yellow-500 mx-auto animate-pulse" />
18|        </div>
19|
20|        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
21|          Pagamento em Processamento
22|        </h1>
23|
24|        <p className="text-gray-600 dark:text-gray-300 mb-6">
25|          Seu pagamento está sendo processado. Isso pode levar alguns minutos. Você receberá uma notificação assim que for confirmado.
26|        </p>
27|
28|        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
29|          <p className="text-sm text-yellow-800 dark:text-yellow-300 font-semibold mb-2">
30|            ⏳ O que acontece agora?
31|          </p>
32|          <ul className="text-sm text-yellow-700 dark:text-yellow-400 text-left space-y-2">
33|            <li>• Aguarde a confirmação do pagamento</li>
34|            <li>• Você receberá um email quando for aprovado</li>
35|            <li>• O acesso será liberado automaticamente</li>
36|            <li>• Pode levar até 2 dias úteis (boleto)</li>
37|          </ul>
38|        </div>
39|
40|        <div className="space-y-3">
41|          <button
42|            onClick={() => navigate('/dashboard')}
43|            className="w-full flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors"
44|          >
45|            <ArrowLeft className="w-5 h-5 mr-2" />
46|            Voltar ao Dashboard
47|          </button>
48|
49|          <button
50|            onClick={() => navigate('/pricing')}
51|            className="w-full px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-xl font-semibold transition-colors"
52|          >
53|            Ver Planos
54|          </button>
55|        </div>
56|
57|        <p className="text-sm text-gray-500 dark:text-gray-400 mt-6">
58|          📧 Acompanhe o status pelo seu email
59|        </p>
60|      </div>
61|    </div>
62|  );
63|}
64|
