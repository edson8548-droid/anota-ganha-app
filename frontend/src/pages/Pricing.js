1|import React, { useState, useEffect } from 'react';
2|import { useNavigate } from 'react-router-dom';
3|import { useAuth } from '../contexts/AuthContext';
4|import axios from 'axios';
5|import { CreditCard, Check, ArrowLeft, Clock, Zap } from 'lucide-react';
6|import { toast } from 'sonner';
7|
8|const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
9|
10|export default function Pricing() {
11|  const { user, refreshUser } = useAuth();
12|  const navigate = useNavigate();
13|  const [loading, setLoading] = useState(false);
14|  const [selectedPlan, setSelectedPlan] = useState(null);
15|
16|  const plans = [
17|    {
18|      id: 'monthly_simple',
19|      name: 'Mensal Flexível',
20|      price: 35.00,
21|      interval: 'mês',
22|      billingInfo: 'Sem compromisso - Cancele quando quiser',
23|      features: [
24|        'Campanhas ilimitadas',
25|        'Clientes ilimitados',
26|        'Relatórios por cidade',
27|        'Suporte via email',
28|        'Acesso completo ao app',
29|        '✅ Cancele a qualquer momento',
30|        '🔄 Renovação automática'
31|      ],
32|      popular: false,
33|      flexible: true
34|    },
35|    {
36|      id: 'monthly',
37|      name: 'Mensal 12 meses',
38|      price: 29.90,
39|      totalYear: 358.80,
40|      interval: '12x de R$ 29,90',
41|      billingInfo: 'Cobrado mensalmente por 12 meses',
42|      features: [
43|        'Campanhas ilimitadas',
44|        'Clientes ilimitados',
45|        'Relatórios por cidade',
46|        'Suporte via email',
47|        'Acesso completo ao app',
48|        '💰 R$ 5,10 mais barato por mês',
49|        '🔄 Renovação automática'
50|      ],
51|      popular: true,
52|      recommended: '✨ Melhor Valor'
53|    },
54|    {
55|      id: 'annual',
56|      name: 'Anual',
57|      price: 300.00,
58|      originalPrice: 420.00,
59|      interval: 'ano',
60|      billingInfo: 'Pagamento único anual',
61|      discount: '💰 Economize R$ 120/ano',
62|      features: [
63|        'Campanhas ilimitadas',
64|        'Clientes ilimitados',
65|        'Relatórios por cidade',
66|        'Suporte prioritário',
67|        'Acesso completo ao app',
68|        '💵 Máxima economia',
69|        '🔄 Renovação automática'
70|      ],
71|      popular: false
72|    }
73|  ];
74|
75|  const handleSelectPlan = async (planId) => {
76|    if (!user) {
77|      toast.error('Você precisa estar logado');
78|      navigate('/login');
79|      return;
80|    }
81|
82|    setSelectedPlan(planId);
83|    setLoading(true);
84|
85|    try {
86|      // Criar assinatura sem cartão - redirecionar para Mercado Pago
87|      const response = await axios.post(
88|        `${API_URL}/subscriptions/create`,
89|        {
90|          card_token: '', // Não precisa mais de token
91|          plan_type: planId,
92|          payer_email: user.email
93|        },
94|        {
95|          headers: {
96|            Authorization: `Bearer ${localStorage.getItem('token')}`
97|          }
98|        }
99|      );
100|
101|      const { init_point } = response.data;
102|
103|      if (init_point) {
104|        // Redirecionar para Mercado Pago para cadastrar cartão
105|        toast.info('Redirecionando para pagamento seguro...');
106|        setTimeout(() => {
107|          window.location.href = init_point;
108|        }, 1000);
109|      } else {
110|        toast.error('Erro ao criar assinatura. Tente novamente.');
111|        setLoading(false);
112|      }
113|
114|    } catch (error) {
115|      console.error('Erro ao criar assinatura:', error);
116|      const errorMessage = error.response?.data?.detail || 'Erro ao processar. Tente novamente.';
117|      toast.error(errorMessage);
118|      setLoading(false);
119|      setSelectedPlan(null);
120|    }
121|  };
122|
123|  const handlePayWithPix = async (planId) => {
124|    if (!user) {
125|      toast.error('Você precisa estar logado');
126|      navigate('/login');
127|      return;
128|    }
129|
130|    setSelectedPlan(planId);
131|    setLoading(true);
132|
133|    try {
134|      // Criar preferência de pagamento (suporta Pix, cartão, boleto)
135|      const response = await axios.post(
136|        `${API_URL}/payments/create-preference`,
137|        {
138|          plan: planId,
139|          payer_email: user.email,
140|          payer_name: user.name || user.email
141|        },
142|        {
143|          headers: {
144|            Authorization: `Bearer ${localStorage.getItem('token')}`
145|          }
146|        }
147|      );
148|
149|      const { init_point } = response.data;
150|
151|      if (init_point) {
152|        toast.success('Redirecionando para pagamento...');
153|        setTimeout(() => {
154|          window.location.href = init_point;
155|        }, 1000);
156|      } else {
157|        toast.error('Erro ao criar pagamento. Tente novamente.');
158|        setLoading(false);
159|      }
160|
161|    } catch (error) {
162|      console.error('Erro ao criar pagamento:', error);
163|      const errorMessage = error.response?.data?.detail || 'Erro ao processar. Tente novamente.';
164|      toast.error(errorMessage);
165|      setLoading(false);
166|      setSelectedPlan(null);
167|    }
168|  };
169|
170|  const getLicenseInfo = () => {
171|    if (!user) return null;
172|
173|    const { license_type, license_expiry } = user;
174|    
175|    if (license_type === 'trial') {
176|      const daysRemaining = license_expiry 
177|        ? Math.ceil((new Date(license_expiry) - new Date()) / (1000 * 60 * 60 * 24))
178|        : 0;
179|      
180|      return {
181|        type: 'trial',
182|        message: `Período de teste: ${daysRemaining} dias restantes`,
183|        color: 'bg-yellow-100 text-yellow-800 border-yellow-300'
184|      };
185|    }
186|
187|    if (license_type === 'monthly' || license_type === 'annual') {
188|      return {
189|        type: 'active',
190|        message: `Plano ${license_type === 'monthly' ? 'Mensal' : 'Anual'} ativo`,
191|        color: 'bg-green-100 text-green-800 border-green-300'
192|      };
193|    }
194|
195|    if (license_type === 'expired') {
196|      return {
197|        type: 'expired',
198|        message: 'Seu período de teste expirou',
199|        color: 'bg-red-100 text-red-800 border-red-300'
200|      };
201|    }
202|
203|    return null;
204|  };
205|
206|  const licenseInfo = getLicenseInfo();
207|
208|  return (
209|    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
210|      <div className="container mx-auto px-4 py-8">
211|        {/* Header */}
212|        <div className="mb-8">
213|          <button
214|            onClick={() => navigate('/dashboard')}
215|            className="flex items-center text-blue-600 hover:text-blue-700 mb-4"
216|          >
217|            <ArrowLeft className="w-5 h-5 mr-2" />
218|            Voltar ao Dashboard
219|          </button>
220|
221|          <div className="text-center">
222|            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
223|              Escolha seu Plano
224|            </h1>
225|            <p className="text-xl text-gray-600 dark:text-gray-300">
226|              Selecione o plano ideal para o seu negócio
227|            </p>
228|
229|            {/* License Status Badge */}
230|            {licenseInfo && (
231|              <div className={`inline-flex items-center px-4 py-2 rounded-full border-2 mt-4 ${licenseInfo.color}`}>
232|                {licenseInfo.type === 'active' && <Check className="w-5 h-5 mr-2" />}
233|                {licenseInfo.type === 'trial' && <Clock className="w-5 h-5 mr-2" />}
234|                <span className="font-semibold">{licenseInfo.message}</span>
235|              </div>
236|            )}
237|          </div>
238|        </div>
239|
240|        {/* Plans Grid */}
241|        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
242|          {plans.map((plan) => (
243|            <div
244|              key={plan.id}
245|              className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden transition-all duration-300 hover:shadow-2xl hover:scale-105 ${
246|                plan.popular ? 'ring-4 ring-blue-500' : ''
247|              }`}
248|            >
249|              {/* Popular/Recommended/Flexible Badge */}
250|              {plan.popular && plan.recommended && (
251|                <div className="absolute top-0 right-0 bg-gradient-to-r from-yellow-400 to-yellow-500 text-gray-900 px-4 py-1 rounded-bl-lg font-bold shadow-lg">
252|                  <Zap className="inline w-4 h-4 mr-1" />
253|                  {plan.recommended}
254|                </div>
255|              )}
256|              {plan.popular && !plan.recommended && (
257|                <div className="absolute top-0 right-0 bg-blue-500 text-white px-4 py-1 rounded-bl-lg font-semibold">
258|                  <Zap className="inline w-4 h-4 mr-1" />
259|                  Mais Popular
260|                </div>
261|              )}
262|              {plan.flexible && (
263|                <div className="absolute top-0 right-0 bg-gradient-to-r from-green-400 to-green-500 text-white px-4 py-1 rounded-bl-lg font-bold shadow-lg">
264|                  ✅ Sem Compromisso
265|                </div>
266|              )}
267|
268|              <div className="p-8">
269|                {/* Plan Header */}
270|                <div className="mb-6">
271|                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
272|                    {plan.name}
273|                  </h3>
274|                  <div className="flex items-baseline">
275|                    {plan.id === 'monthly' ? (
276|                      <>
277|                        <span className="text-5xl font-extrabold text-gray-900 dark:text-white">
278|                          R$ {plan.price.toFixed(2)}
279|                        </span>
280|                        <span className="text-xl text-gray-500 dark:text-gray-400 ml-2">
281|                          /mês
282|                        </span>
283|                      </>
284|                    ) : (
285|                      <span className="text-5xl font-extrabold text-gray-900 dark:text-white">
286|                        R$ {plan.price.toFixed(2)}
287|                      </span>
288|                    )}
289|                  </div>
290|                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
291|                    {plan.billingInfo}
292|                  </p>
293|                  {plan.totalYear && (
294|                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 font-medium">
295|                      Total: R$ {plan.totalYear.toFixed(2)}/ano
296|                    </p>
297|                  )}
298|                  {plan.originalPrice && (
299|                    <div className="mt-2">
300|                      <span className="text-gray-500 line-through">
301|                        R$ {plan.originalPrice.toFixed(2)}
302|                      </span>
303|                      <span className="ml-2 text-green-600 font-semibold">
304|                        {plan.discount}
305|                      </span>
306|                    </div>
307|                  )}
308|                </div>
309|
310|                {/* Features */}
311|                <ul className="space-y-3 mb-8">
312|                  {plan.features.map((feature, index) => (
313|                    <li key={index} className="flex items-start">
314|                      <Check className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
315|                      <span className="text-gray-700 dark:text-gray-300">{feature}</span>
316|                    </li>
317|                  ))}
318|                </ul>
319|
320|                {/* CTA Buttons */}
321|                <div className="space-y-3">
322|                  <button
323|                    onClick={() => handleSelectPlan(plan.id)}
324|                    disabled={loading && selectedPlan === plan.id}
325|                    className={`w-full py-4 px-6 rounded-xl font-bold text-lg transition-all duration-300 flex items-center justify-center ${
326|                      plan.popular
327|                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl'
328|                        : 'bg-gray-200 hover:bg-gray-300 text-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white'
329|                    } ${loading && selectedPlan === plan.id ? 'opacity-50 cursor-not-allowed' : ''}`}
330|                  >
331|                    {loading && selectedPlan === plan.id ? (
332|                      <>
333|                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
334|                        Processando...
335|                      </>
336|                    ) : (
337|                      <>
338|                        <CreditCard className="w-5 h-5 mr-2" />
339|                        Assinar com Cartão
340|                      </>
341|                    )}
342|                  </button>
343|
344|                  <button
345|                    onClick={() => handlePayWithPix(plan.id)}
346|                    disabled={loading && selectedPlan === plan.id}
347|                    className="w-full py-4 px-6 rounded-xl font-bold text-lg transition-all duration-300 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
348|                  >
349|                    {loading && selectedPlan === plan.id ? (
350|                      <>
351|                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
352|                        Processando...
353|                      </>
354|                    ) : (
355|                      <>
356|                        <span className="text-xl mr-2">🔑</span>
357|                        Pagar com Pix
358|                      </>
359|                    )}
360|                  </button>
361|                </div>
362|              </div>
363|            </div>
364|          ))}
365|        </div>
366|
367|        {/* Additional Info */}
368|        <div className="max-w-3xl mx-auto text-center text-gray-600 dark:text-gray-400">
369|          <p className="mb-2">
370|            🔒 Pagamento 100% seguro através do Mercado Pago
371|          </p>
372|          <p className="mb-2">
373|            ✅ Cancele a qualquer momento sem multa
374|          </p>
375|          <p>
376|            📧 Dúvidas? Entre em contato conosco
377|          </p>
378|        </div>
379|      </div>
380|    </div>
381|  );
382|}
383|
