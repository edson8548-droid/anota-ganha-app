1|import React from 'react';
2|import { Edit, Trash2, FileText, MapPin, CheckCircle, Circle, ChevronDown, ChevronUp } from 'lucide-react';
3|
4|export default function ClientCardIndustries({ client, campaign, onEdit, onDelete, onUpdateProduct }) {
5|  const [expandedIndustries, setExpandedIndustries] = React.useState({});
6|
7|  const formatCurrency = (value) => {
8|    return new Intl.NumberFormat('pt-BR', {
9|      style: 'currency',
10|      currency: 'BRL'
11|    }).format(value || 0);
12|  };
13|
14|  const toggleIndustry = (industryName) => {
15|    setExpandedIndustries(prev => ({
16|      ...prev,
17|      [industryName]: !prev[industryName]
18|    }));
19|  };
20|
21|  const handleProductToggle = (industryName, productName) => {
22|    const currentProduct = client.industries?.[industryName]?.products?.[productName] || { status: '', value: 0 };
23|    const newStatus = currentProduct.status?.toLowerCase() === 'positivado' ? '' : 'positivado';
24|    
25|    onUpdateProduct(client.id, industryName, productName, {
26|      status: newStatus,
27|      value: currentProduct.value || 0
28|    });
29|  };
30|
31|  const handleValueChange = (industryName, productName, newValue) => {
32|    const currentProduct = client.industries?.[industryName]?.products?.[productName] || { status: '', value: 0 };
33|    
34|    onUpdateProduct(client.id, industryName, productName, {
35|      status: currentProduct.status,
36|      value: parseFloat(newValue) || 0
37|    });
38|  };
39|
40|  // Calcular totais
41|  const calculateIndustryTotal = (industryName) => {
42|    const industryData = client.industries?.[industryName];
43|    if (!industryData?.products) return 0;
44|    
45|    return Object.values(industryData.products).reduce((sum, product) => {
46|      return sum + (parseFloat(product.value) || 0);
47|    }, 0);
48|  };
49|
50|  const calculatePositivadosCount = (industryName) => {
51|    const industryData = client.industries?.[industryName];
52|    if (!industryData?.products) return { positivados: 0, total: 0 };
53|    
54|    const products = Object.values(industryData.products);
55|    const positivados = products.filter(p => p.status?.toLowerCase() === 'positivado').length;
56|    
57|    return { positivados, total: products.length };
58|  };
59|
60|  // Verificar se TODOS os produtos de TODAS as indústrias estão positivados
61|  const checkAllProductsPositivated = () => {
62|    if (!client.industries || !campaign?.industries) return false;
63|    
64|    let totalProducts = 0;
65|    let totalPositivated = 0;
66|    
67|    // Iterar sobre as indústrias da campanha
68|    campaign.industries.forEach(campaignIndustry => {
69|      const industryName = campaignIndustry.name.toLowerCase();
70|      const clientIndustry = Object.keys(client.industries).find(
71|        key => key.toLowerCase() === industryName
72|      );
73|      
74|      if (clientIndustry && client.industries[clientIndustry]?.products) {
75|        const products = client.industries[clientIndustry].products;
76|        Object.values(products).forEach(product => {
77|          totalProducts++;
78|          if (product.status?.toLowerCase() === 'positivado') {
79|            totalPositivated++;
80|          }
81|        });
82|      }
83|    });
84|    
85|    return totalProducts > 0 && totalProducts === totalPositivated;
86|  };
87|
88|  const isFullyPositivated = checkAllProductsPositivated();
89|
90|  return (
91|    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden relative" data-testid="client-card">
92|      {/* Badge de Parabéns - 100% Positivado */}
93|      {isFullyPositivated && (
94|        <div className="absolute top-2 right-2 z-10 bg-green-500 text-white px-3 py-1 rounded-full shadow-lg flex items-center space-x-1 animate-pulse">
95|          <span className="text-lg">🎉</span>
96|          <span className="text-xs font-bold">100%</span>
97|        </div>
98|      )}
99|      
100|      {/* Header - Compacto */}
101|      <div className="bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-700 dark:to-blue-800 p-2">
102|        <div className="flex justify-between items-start">
103|          <div className="flex-1 min-w-0 mr-2">
104|            <h2 className="text-base md:text-lg font-bold text-white truncate" title={client.CLIENTE}>
105|              {client.CLIENTE}
106|            </h2>
107|            {client.CIDADE && (
108|              <div className="flex items-center mt-0.5">
109|                <MapPin className="w-3 h-3 mr-1 text-blue-100" />
110|                <span className="text-xs text-blue-100 font-medium">
111|                  {client.CIDADE}
112|                </span>
113|              </div>
114|            )}
115|          </div>
116|          <div className="flex items-center space-x-1 flex-shrink-0">
117|            <button
118|              onClick={() => onEdit(client)}
119|              className="p-1.5 text-white hover:bg-white/20 rounded-full transition-colors"
120|              title="Editar Cliente"
121|              data-testid="edit-client-btn"
122|            >
123|              <Edit className="w-4 h-4" />
124|            </button>
125|            <button
126|              onClick={() => onDelete(client.id)}
127|              className="p-1.5 text-white hover:bg-white/20 rounded-full transition-colors"
128|              title="Excluir Cliente"
129|              data-testid="delete-client-btn"
130|            >
131|              <Trash2 className="w-4 h-4" />
132|            </button>
133|          </div>
134|        </div>
135|      </div>
136|
137|      {/* Client Info - Mais compacto */}
138|      {(client.CNPJ || client.ENDERECO) && (
139|        <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
140|          <div className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
141|            {client.CNPJ && (
142|              <div className="flex items-center truncate">
143|                <FileText className="w-3 h-3 mr-1 flex-shrink-0" />
144|                <span className="truncate">{client.CNPJ}</span>
145|              </div>
146|            )}
147|            {client.ENDERECO && (
148|              <div className="flex items-center truncate">
149|                <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
150|                <span className="truncate">{client.ENDERECO}</span>

Action: file_editor view /app/frontend/src/components/ClientCardIndustries.js
Observation: /app/frontend/src/components/ClientCardIndustries.js:
151|              </div>
152|            )}
153|          </div>
154|        </div>
155|      )}
156|
157|      {/* Industries List - Compacto */}
158|      <div className="p-2 space-y-2">
159|        {client.industries && Object.keys(client.industries).length > 0 ? (
160|          Object.entries(client.industries).map(([industryName, industryData], index) => {
161|            const isIndustryPositivado = industryData.industry_status?.toLowerCase() === 'positivado';
162|            const isExpanded = expandedIndustries[industryName];
163|            const industryTotal = calculateIndustryTotal(industryName);
164|            const { positivados, total } = calculatePositivadosCount(industryName);
165|            
166|            // Buscar dados da indústria na campanha
167|            const campaignIndustry = campaign?.industries?.find(ind => ind.name === industryName);
168|            if (!campaignIndustry) return null;
169|
170|            return (
171|              <div
172|                key={index}
173|                className={`border-2 rounded-lg overflow-hidden transition-all ${
174|                  isIndustryPositivado
175|                    ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
176|                    : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50'
177|                }`}
178|              >
179|                {/* Industry Header - Compacto */}
180|                <button
181|                  onClick={() => toggleIndustry(industryName)}
182|                  className="w-full p-2 flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
183|                >
184|                  <div className="flex items-center gap-2 flex-1 min-w-0">
185|                    {isIndustryPositivado ? (
186|                      <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
187|                    ) : (
188|                      <Circle className="w-4 h-4 text-gray-400 flex-shrink-0" />
189|                    )}
190|                    <div className="text-left flex-1 min-w-0">
191|                      <h3 className="font-bold text-sm text-gray-900 dark:text-white truncate">
192|                        {industryName}
193|                      </h3>
194|                      <p className="text-xs text-gray-600 dark:text-gray-400">
195|                        {positivados}/{total} • {formatCurrency(industryTotal)}
196|                      </p>
197|                    </div>
198|                  </div>
199|                  <div className="flex items-center gap-2 flex-shrink-0">
200|                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
201|                      isIndustryPositivado
202|                        ? 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200'
203|                        : 'bg-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
204|                    }`}>
205|                      {isIndustryPositivado ? '✓' : '✗'}
206|                    </span>
207|                    {isExpanded ? (
208|                      <ChevronUp className="w-4 h-4" />
209|                    ) : (
210|                      <ChevronDown className="w-4 h-4" />
211|                    )}
212|                  </div>
213|                </button>
214|
215|                {/* Products List (Expandable) - Compacto */}
216|                {isExpanded && (
217|                  <div className="border-t border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/30 p-2 space-y-1.5">
218|                    {campaignIndustry.products.map((productName, pIndex) => {
219|                      const productData = industryData.products[productName] || { status: '', value: 0 };
220|                      const isPositivado = productData.status?.toLowerCase() === 'positivado';
221|
222|                      return (
223|                        <div
224|                          key={pIndex}
225|                          className={`flex items-center gap-2 p-2 rounded-md border ${
226|                            isPositivado
227|                              ? 'border-green-300 bg-green-100 dark:bg-green-900/30'
228|                              : 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800'
229|                          }`}
230|                        >
231|                          {/* Checkbox */}
232|                          <button
233|                            onClick={() => handleProductToggle(industryName, productName)}
234|                            className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
235|                              isPositivado
236|                                ? 'bg-green-600 border-green-600'
237|                                : 'bg-white dark:bg-gray-700 border-gray-400 hover:border-green-600'
238|                            }`}
239|                          >
240|                            {isPositivado && <CheckCircle className="w-4 h-4 text-white" />}
241|                          </button>
242|
243|                          {/* Product Name */}
244|                          <span className="flex-1 text-xs md:text-sm font-medium text-gray-900 dark:text-white truncate">
245|                            {productName}
246|                          </span>
247|
248|                          {/* Value Input */}
249|                          <div className="flex items-center gap-1 flex-shrink-0">
250|                            <span className="text-xs text-gray-500 dark:text-gray-400">R$</span>
251|                            <input
252|                              type="number"
253|                              value={productData.value || 0}
254|                              onChange={(e) => handleValueChange(industryName, productName, e.target.value)}
255|                              className="w-16 md:w-20 px-1 py-1 border rounded-md text-right text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-white"
256|                              step="0.01"
257|                              min="0"
258|                              onClick={(e) => e.stopPropagation()}
259|                            />
260|                          </div>
261|                        </div>
262|                      );
263|                    })}
264|                  </div>
265|                )}
266|              </div>
267|            );
268|          })
269|        ) : (
270|          <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
271|            Nenhuma indústria cadastrada
272|          </div>
273|        )}
274|      </div>
275|
276|      {/* Notes - Compacto */}
277|      {client.notes && (
278|        <div className="px-2 pb-2">
279|          <div className="text-xs text-gray-600 dark:text-gray-400 bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded border border-yellow-200 dark:border-yellow-800">
280|            <strong>Obs:</strong> {client.notes}
281|          </div>
282|        </div>
283|      )}
284|    </div>
285|  );
286|}
287|

