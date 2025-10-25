1|import React, { useEffect } from 'react';
2|import { useNavigate, useSearchParams } from 'react-router-dom';
3|import { CheckCircle, ArrowRight } from 'lucide-react';
4|import { toast } from 'sonner';
5|
6|export default function PaymentSuccess() {
7|  const navigate = useNavigate();
8|  const [searchParams] = useSearchParams();
9|
10|  useEffect(() => {
11|    toast.success('Pagamento aprovado com sucesso!');
12|  }, []);
13|
14|  const paymentId = searchParams.get('payment_id');
15|  const status = searchParams.get('status');
16|
17|  return (
18|    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
19|      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 text-center">
20|        <div className="mb-6">
21|          <CheckCircle className="w-24 h-24 text-green-500 mx-auto animate-bounce" />
22|        </div>
23|
24|        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
25|          Pagamento Aprovado! 🎉
26|        </h1>
27|
28|        <p className="text-gray-600 dark:text-gray-300 mb-6">
29|          Sua assinatura foi ativada com sucesso. Agora você tem acesso completo a todas as funcionalidades do aplicativo!
30|        </p>
31|
32|        {paymentId && (
33|          <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4 mb-6">
34|            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
35|              ID do Pagamento
36|            </p>
37|            <p className="text-sm font-mono text-gray-900 dark:text-white">
38|              {paymentId}
39|            </p>
40|          </div>
41|        )}
42|
43|        <div className="space-y-3">
44|          <button
45|            onClick={() => navigate('/dashboard')}
46|            className="w-full flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors"
47|          >
48|            Ir para o Dashboard
49|            <ArrowRight className="w-5 h-5 ml-2" />
50|          </button>
51|
52|          <button
53|            onClick={() => navigate('/pricing')}
54|            className="w-full px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-xl font-semibold transition-colors"
55|          >
56|            Ver Planos
57|          </button>
58|        </div>
59|
60|        <p className="text-sm text-gray-500 dark:text-gray-400 mt-6">
61|          ✉️ Você receberá um email de confirmação em breve
62|        </p>
63|      </div>
64|    </div>
65|  );
66|}
67|
