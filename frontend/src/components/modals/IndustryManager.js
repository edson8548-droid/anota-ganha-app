
Action: file_editor view /app/frontend/src/components/modals/IndustryManager.js
Observation: /app/frontend/src/components/modals/IndustryManager.js:
1|import React, { useState } from 'react';
2|import { X, Plus, Trash2, Edit2, Check } from 'lucide-react';
3|
4|export default function IndustryManager({ industries, onChange }) {
5|  const [editingIndex, setEditingIndex] = useState(null);
6|  const [editingProduct, setEditingProduct] = useState({ industryIndex: null, productIndex: null });
7|  const [focusedGoalIndex, setFocusedGoalIndex] = useState(null);
8|
9|  // Formatar valor para moeda brasileira
10|  const formatCurrency = (value) => {
11|    const numValue = parseFloat(value) || 0;
12|    return numValue.toLocaleString('pt-BR', {
13|      minimumFractionDigits: 2,
14|      maximumFractionDigits: 2
15|    });
16|  };
17|
18|  const addIndustry = () => {
19|    onChange([...industries, { name: '', goal: 0, products: [] }]);
20|    setEditingIndex(industries.length);
21|  };
22|
23|  const removeIndustry = (index) => {
24|    const newIndustries = industries.filter((_, i) => i !== index);
25|    onChange(newIndustries);
26|    setEditingIndex(null);
27|  };
28|
29|  const updateIndustry = (index, field, value) => {
30|    const newIndustries = [...industries];
31|    newIndustries[index] = { ...newIndustries[index], [field]: value };
32|    onChange(newIndustries);
33|  };
34|
35|  const handleGoalChange = (index, value) => {
36|    // Apenas números e ponto/vírgula
37|    const cleaned = value.replace(/[^\d.,]/g, '').replace(',', '.');
38|    const numValue = parseFloat(cleaned) || 0;
39|    updateIndustry(index, 'goal', numValue);
40|  };
41|
42|  const addProduct = (industryIndex) => {
43|    const newIndustries = [...industries];
44|    newIndustries[industryIndex].products.push('');
45|    onChange(newIndustries);
46|    setEditingProduct({ industryIndex, productIndex: newIndustries[industryIndex].products.length - 1 });
47|  };
48|
49|  const removeProduct = (industryIndex, productIndex) => {
50|    const newIndustries = [...industries];
51|    newIndustries[industryIndex].products.splice(productIndex, 1);
52|    onChange(newIndustries);
53|    setEditingProduct({ industryIndex: null, productIndex: null });
54|  };
55|
56|  const updateProduct = (industryIndex, productIndex, value) => {
57|    const newIndustries = [...industries];
58|    newIndustries[industryIndex].products[productIndex] = value;
59|    onChange(newIndustries);
60|  };
61|
62|  return (
63|    <div className="space-y-4">
64|      <div className="flex justify-between items-center">
65|        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
66|          Indústrias e Produtos
67|        </h3>
68|        <button
69|          type="button"
70|          onClick={addIndustry}
71|          className="flex items-center px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
72|        >
73|          <Plus className="w-4 h-4 mr-1" />
74|          Adicionar Indústria
75|        </button>
76|      </div>
77|
78|      {industries.length === 0 && (
79|        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
80|          Nenhuma indústria adicionada. Clique em "Adicionar Indústria" para começar.
81|        </div>
82|      )}
83|
84|      <div className="space-y-4">
85|        {industries.map((industry, industryIndex) => (
86|          <div
87|            key={industryIndex}
88|            className="border-2 border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800"
89|          >
90|            {/* Cabeçalho da Indústria */}
91|            <div className="flex items-start gap-3 mb-3">
92|              <div className="flex-1 space-y-2">
93|                {/* Nome da Indústria */}
94|                <div>
95|                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
96|                    Nome da Indústria
97|                  </label>
98|                  <input
99|                    type="text"
100|                    value={industry.name}
101|                    onChange={(e) => updateIndustry(industryIndex, 'name', e.target.value)}
102|                    placeholder="Ex: Camil, JDE Café Turbinado, M. Dia"
103|                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
104|                  />
105|                </div>
106|
107|                {/* Meta da Indústria */}
108|                <div>
109|                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
110|                    Meta de Valor
111|                  </label>
112|                  <div className="relative">
113|                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-semibold">
114|                      R$
115|                    </span>
116|                    <input
117|                      type="text"
118|                      value={focusedGoalIndex === industryIndex 
119|                        ? (industry.goal || '') 
120|                        : formatCurrency(industry.goal)
121|                      }
122|                      onChange={(e) => handleGoalChange(industryIndex, e.target.value)}
123|                      onFocus={() => setFocusedGoalIndex(industryIndex)}
124|                      onBlur={() => setFocusedGoalIndex(null)}
125|                      placeholder="0,00"
126|                      className="w-full pl-12 pr-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white font-semibold text-green-600 dark:text-green-400"
127|                    />
128|                  </div>
129|                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
130|                    Digite apenas números. Ex: 1500 vira R$ 1.500,00
131|                  </p>
132|                </div>
133|              </div>
134|
135|              {/* Botão Remover Indústria */}
136|              <button
137|                type="button"
138|                onClick={() => removeIndustry(industryIndex)}
139|                className="mt-7 p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
140|                title="Remover indústria"
141|              >
142|                <Trash2 className="w-5 h-5" />
143|              </button>
144|            </div>
145|
146|            {/* Lista de Produtos */}
147|            <div className="mt-4 pt-4 border-t border-gray-300 dark:border-gray-600">
148|              <div className="flex justify-between items-center mb-2">
149|                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
150|                  Produtos da Indústria
151|                </label>
152|                <button
153|                  type="button"
154|                  onClick={() => addProduct(industryIndex)}
155|                  className="flex items-center px-2 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 text-xs"
156|                >
157|                  <Plus className="w-3 h-3 mr-1" />
158|                  Adicionar Produto
159|                </button>
160|              </div>
161|
162|              {industry.products.length === 0 && (
163|                <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
164|                  Nenhum produto. Adicione produtos para esta indústria.
165|                </div>
166|              )}
167|
168|              <div className="space-y-2">
169|                {industry.products.map((product, productIndex) => (
170|                  <div key={productIndex} className="flex items-center gap-2">
171|                    <input
172|                      type="text"
173|                      value={product}
174|                      onChange={(e) => updateProduct(industryIndex, productIndex, e.target.value)}
175|                      placeholder="Ex: Sardinha Coqueiro, Café Pilão"
176|                      className="flex-1 px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
177|                    />
178|                    <button
179|                      type="button"
180|                      onClick={() => removeProduct(industryIndex, productIndex)}
181|                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
182|                      title="Remover produto"
183|                    >
184|                      <X className="w-4 h-4" />
185|                    </button>
186|                  </div>
187|                ))}
188|              </div>
189|            </div>
190|
191|            {/* Contador de Produtos */}
192|            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
193|              {industry.products.length} produto(s) cadastrado(s)
194|            </div>
195|          </div>
196|        ))}
197|      </div>
198|    </div>
199|  );
200|}
201|
