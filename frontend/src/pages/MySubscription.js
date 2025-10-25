1|import React, { useState, useEffect } from 'react';
2|import { useNavigate } from 'react-router-dom';
3|import { useAuth } from '../contexts/AuthContext';
4|import axios from 'axios';
5|import { ArrowLeft, Calendar, CreditCard, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
6|import { toast } from 'sonner';
7|
8|const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
9|
10|export default function MySubscription() {
11|  const { user, refreshUser } = useAuth();
12|  const navigate = useNavigate();
13|  const [subscription, setSubscription] = useState(null);
14|  const [loading, setLoading] = useState(true);
15|  const [canceling, setCanceling] = useState(false);
16|
17|  useEffect(() => {
18|    loadSubscription();
19|  }, []);
20|
21|  const loadSubscription = async () => {
22|    try {
23|      const response = await axios.get(`${API_URL}/subscriptions/status`, {
24|        headers: {
25|          Authorization: `Bearer ${localStorage.getItem('token')}`
26|        }
27|      });
28|
29|      if (response.data.has_subscription) {
30|        setSubscription(response.data.subscription);
31|      }
32|    } catch (error) {
33|      console.error('Erro ao carregar assinatura:', error);
34|      toast.error('Erro ao carregar dados da assinatura');
35|    } finally {
36|      setLoading(false);
37|    }
38|  };
39|
40|  const handleCancelSubscription = async () => {
41|    if (!window.confirm('Tem certeza que deseja cancelar sua assinatura? Você perderá acesso ao sistema após o período atual.')) {
42|      return;
43|    }
44|
45|    setCanceling(true);
46|
47|    try {
48|      await axios.delete(`${API_URL}/subscriptions/cancel`, {
49|        headers: {
50|          Authorization: `Bearer ${localStorage.getItem('token')}`
51|        }
52|      });
53|
54|      toast.success('Assinatura cancelada com sucesso!');
55|      
56|      // Recarregar dados
57|      await loadSubscription();
58|      await refreshUser();
59|
60|    } catch (error) {
61|      console.error('Erro ao cancelar assinatura:', error);
62|      toast.error(error.response?.data?.detail || 'Erro ao cancelar assinatura');
63|    } finally {
64|      setCanceling(false);
65|    }
66|  };
67|
68|  const getPlanName = (planType) => {
69|    const plans = {
70|      'monthly_simple': 'Mensal Flexível (R$ 35/mês)',
71|      'monthly': 'Mensal 12 meses (12x R$ 29,90)',
72|      'annual': 'Anual (R$ 300/ano)'
73|    };
74|    return plans[planType] || 'Plano Desconhecido';
75|  };
76|
77|  const getStatusBadge = (status) => {
78|    const badges = {
79|      'authorized': { icon: CheckCircle, text: 'Ativa', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
80|      'pending': { icon: AlertCircle, text: 'Pendente', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
81|      'cancelled': { icon: XCircle, text: 'Cancelada', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' }
82|    };
83|
84|    const badge = badges[status] || badges['pending'];
85|    const Icon = badge.icon;
86|
87|    return (
88|      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${badge.color}`}>
89|        <Icon className="w-4 h-4 mr-1" />
90|        {badge.text}
91|      </span>
92|    );
93|  };
94|
95|  const formatDate = (dateString) => {
96|    if (!dateString) return 'N/A';
97|    const date = new Date(dateString);
98|    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
99|  };
100|
101|  if (loading) {
102|    return (
103|      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
104|        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
105|      </div>
106|    );
107|  }
108|
109|  return (
110|    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 py-12 px-4">
111|      <div className="max-w-4xl mx-auto">
112|        {/* Header */}
113|        <div className="mb-8">
114|          <button
115|            onClick={() => navigate('/')}
116|            className="flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mb-4"
117|          >
118|            <ArrowLeft className="w-5 h-5 mr-2" />
119|            Voltar ao Dashboard
120|          </button>
121|          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
122|            Minha Assinatura
123|          </h1>
124|        </div>
125|
126|        {/* Subscription Info */}
127|        {subscription ? (
128|          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 space-y-6">
129|            {/* Status */}
130|            <div className="flex items-center justify-between pb-6 border-b border-gray-200 dark:border-gray-700">
131|              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
132|                Status da Assinatura
133|              </h2>
134|              {getStatusBadge(subscription.status)}
135|            </div>
136|
137|            {/* Plan Details */}
138|            <div className="grid md:grid-cols-2 gap-6">
139|              <div className="space-y-4">
140|                <div>
141|                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Plano Contratado</p>
142|                  <p className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
143|                    <CreditCard className="w-5 h-5 mr-2 text-blue-600" />
144|                    {getPlanName(subscription.plan_type)}
145|                  </p>
146|                </div>
147|
148|                <div>
149|                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Valor</p>
150|                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
151|                    R$ {subscription.amount?.toFixed(2)}
152|                  </p>
153|                  <p className="text-xs text-gray-500 dark:text-gray-400">
154|                    Cobrança: {subscription.frequency}
155|                  </p>
156|                </div>
157|              </div>
158|
159|              <div className="space-y-4">
160|                <div>
161|                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Data de Início</p>
162|                  <p className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
163|                    <Calendar className="w-5 h-5 mr-2 text-green-600" />
164|                    {formatDate(subscription.created_at)}
165|                  </p>
166|                </div>
167|
168|                {subscription.next_payment_date && (
169|                  <div>
170|                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Próxima Cobrança</p>
171|                    <p className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
172|                      <Calendar className="w-5 h-5 mr-2 text-orange-600" />
173|                      {formatDate(subscription.next_payment_date)}
174|                    </p>
175|                  </div>
176|                )}
177|              </div>
178|            </div>
179|
180|            {/* License Info */}
181|            {user && (
182|              <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
183|                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Informações da Licença</p>
184|                <div className="grid md:grid-cols-2 gap-4">
185|                  <div>
186|                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de Licença</p>
187|                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
188|                      {user.license_type === 'trial' ? 'Período de Teste' : 
189|                       user.license_type === 'monthly' ? 'Mensal' :
190|                       user.license_type === 'annual' ? 'Anual' : 'Ativo'}
191|                    </p>
192|                  </div>
193|                  <div>
194|                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Validade</p>
195|                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
196|                      {user.license_expiry ? formatDate(user.license_expiry) : 'N/A'}
197|                    </p>
198|                  </div>
199|                </div>
200|              </div>
201|            )}
202|
203|            {/* Cancel Button */}
204|            {subscription.status === 'authorized' && (
205|              <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
206|                <button
207|                  onClick={handleCancelSubscription}
208|                  disabled={canceling}
209|                  className="w-full md:w-auto px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
210|                >
211|                  {canceling ? 'Cancelando...' : 'Cancelar Assinatura'}
212|                </button>
213|                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
214|                  Ao cancelar, você terá acesso até o final do período pago atual.
215|                </p>
216|              </div>
217|            )}
218|          </div>
219|        ) : (
220|          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-12 text-center">
221|            <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
222|            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
223|              Nenhuma Assinatura Ativa
224|            </h2>
225|            <p className="text-gray-600 dark:text-gray-400 mb-6">
226|              Você ainda não possui uma assinatura ativa. Escolha um plano para continuar.
227|            </p>
228|            <button
229|              onClick={() => navigate('/pricing')}
230|              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
231|            >
232|              Ver Planos Disponíveis
233|            </button>
234|          </div>
235|        )}
236|      </div>
237|    </div>
238|  );
239|}
240|
