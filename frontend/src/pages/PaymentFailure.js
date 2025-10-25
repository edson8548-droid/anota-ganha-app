1|import React, { useEffect } from 'react';
2|import { useNavigate } from 'react-router-dom';
3|import { XCircle, ArrowLeft, RefreshCcw } from 'lucide-react';
4|import { toast } from 'sonner';
5|
6|export default function PaymentFailure() {
7|  const navigate = useNavigate();
8|
9|  useEffect(() => {
10|    toast.error('Pagamento não aprovado');
11|  }, []);
12|
13|  return (
14|    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
15|      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 text-center">
16|        <div className="mb-6">
17|          <XCircle className="w-24 h-24 text-red-500 mx-auto" />
18|        </div>
19|
20|        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
21|          Pagamento Não Aprovado
22|        </h1>
23|
24|        <p className="text-gray-600 dark:text-gray-300 mb-6">
25|          Não foi possível processar seu pagamento. Isso pode ter acontecido por diversos motivos, como dados incorretos ou saldo insuficiente.
26|        </p>
27|
28|        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
29|          <p className="text-sm text-red-800 dark:text-red-300 font-semibold mb-2">
30|            O que fazer?
31|          </p>
32|          <ul className="text-sm text-red-700 dark:text-red-400 text-left space-y-1">
33|            <li>• Verifique os dados do seu cartão</li>
34|            <li>• Certifique-se de ter saldo disponível</li>
35|            <li>• Tente outro método de pagamento</li>
36|            <li>• Entre em contato com seu banco</li>
37|          </ul>
38|        </div>
39|
40|        <div className="space-y-3">
41|          <button
42|            onClick={() => navigate('/pricing')}
43|            className="w-full flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors"
44|          >
45|            <RefreshCcw className="w-5 h-5 mr-2" />
46|            Tentar Novamente
47|          </button>
48|
49|          <button
50|            onClick={() => navigate('/dashboard')}
51|            className="w-full flex items-center justify-center px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-xl font-semibold transition-colors"
52|          >
53|            <ArrowLeft className="w-5 h-5 mr-2" />
54|            Voltar ao Dashboard
55|          </button>
56|        </div>
57|
58|        <p className="text-sm text-gray-500 dark:text-gray-400 mt-6">
59|          💬 Precisa de ajuda? Entre em contato conosco
60|        </p>
61|      </div>
62|    </div>
63|  );
64|}
65|
