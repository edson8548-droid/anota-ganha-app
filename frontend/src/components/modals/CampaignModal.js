Perfeito, agora vou fornecer este modal completo:

**Arquivo 21: frontend/src/components/modals/CampaignModal.js**

Primeiro, crie a pasta modals:
```
mkdir frontend/src/components/modals
```

Depois copie:
Action: file_editor view /app/frontend/src/components/modals/CampaignModal.js
Observation: /app/frontend/src/components/modals/CampaignModal.js:
1|import React, { useState, useEffect } from 'react';
2|import { X, Save } from 'lucide-react';
3|import IndustryManager from './IndustryManager';
4|
5|export default function CampaignModal({ isOpen, onClose, onSave, campaign }) {
6|  const [formData, setFormData] = useState({
7|    name: '',
8|    start_date: '',
9|    end_date: '',
10|    status: 'active',
11|    industries: []
12|  });
13|
14|  useEffect(() => {
15|    if (campaign) {
16|      // Se a campanha tem industries, usar elas
17|      // Se tem product_goals (formato antigo), não mostrar (será migrado)
18|      setFormData({
19|        name: campaign.name || '',
20|        start_date: campaign.start_date ? new Date(campaign.start_date).toISOString().split('T')[0] : '',
21|        end_date: campaign.end_date ? new Date(campaign.end_date).toISOString().split('T')[0] : '',
22|        status: campaign.status || 'active',
23|        industries: campaign.industries || []
24|      });
25|    } else {
26|      setFormData({
27|        name: '',
28|        start_date: new Date().toISOString().split('T')[0],
29|        end_date: '',
30|        status: 'active',
31|        industries: []
32|      });
33|    }
34|  }, [campaign, isOpen]);
35|
36|  const handleSubmit = () => {
37|    // Garantir que os valores de goal sejam números antes de salvar
38|    const industriesWithNumericGoals = formData.industries.map(industry => ({
39|      ...industry,
40|      goal: typeof industry.goal === 'number' ? industry.goal : parseFloat(industry.goal) || 0
41|    }));
42|    
43|    onSave({
44|      name: formData.name,
45|      start_date: new Date(formData.start_date).toISOString(),
46|      end_date: formData.end_date ? new Date(formData.end_date).toISOString() : null,
47|      status: formData.status,
48|      industries: industriesWithNumericGoals
49|    });
50|  };
51|
52|  if (!isOpen) return null;
53|
54|  return (
55|    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" data-testid="campaign-modal">
56|      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto">
57|        <div className="flex justify-between items-center mb-4">
58|          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
59|            {campaign ? 'Editar Campanha' : 'Nova Campanha'}
60|          </h2>
61|          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
62|            <X className="w-6 h-6" />
63|          </button>
64|        </div>
65|
66|        <div className="space-y-4">
67|          <div>
68|            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
69|              Nome da Campanha *
70|            </label>
71|            <input
72|              type="text"
73|              value={formData.name}
74|              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
75|              className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
76|              placeholder="Ex: SPANI 4º Trimestre"
77|              required
78|            />
79|          </div>
80|
81|          <div className="grid grid-cols-2 gap-4">
82|            <div>
83|              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
84|                Data de Início *
85|              </label>
86|              <input
87|                type="date"
88|                value={formData.start_date}
89|                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
90|                className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
91|                required
92|              />
93|            </div>
94|            <div>
95|              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
96|                Data de Término
97|              </label>
98|              <input
99|                type="date"
100|                value={formData.end_date}
101|                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
102|                className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
103|              />
104|            </div>
105|          </div>
106|
107|          <div>
108|            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
109|              Status
110|            </label>
111|            <select
112|              value={formData.status}
113|              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
114|              className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
115|            >
116|              <option value="active">Ativa</option>
117|              <option value="paused">Pausada</option>
118|              <option value="completed">Concluída</option>
119|            </select>
120|          </div>
121|
122|          {/* Industry Manager */}
123|          <div className="border-t pt-4">
124|            <IndustryManager
125|              industries={formData.industries}
126|              onChange={(industries) => setFormData({ ...formData, industries })}
127|            />
128|          </div>
129|        </div>
130|
131|        <div className="flex justify-end mt-6 space-x-3">
132|          <button
133|            onClick={onClose}
134|            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
135|          >
136|            Cancelar
137|          </button>
138|          <button
139|            onClick={handleSubmit}
140|            disabled={!formData.name || !formData.start_date}
141|            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 flex items-center"
142|            data-testid="save-campaign-btn"
143|          >
144|            <Save className="w-5 h-5 mr-2" />
145|            {campaign ? 'Salvar' : 'Criar'}
146|          </button>
147|        </div>
148|      </div>
149|    </div>
150|  );
151|}
