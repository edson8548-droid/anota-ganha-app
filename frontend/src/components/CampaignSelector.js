1|import React from 'react';
2|import { Building, Plus, Edit, Trash2, BarChart2 } from 'lucide-react';
3|
4|export default function CampaignSelector({
5|  campaigns,
6|  activeCampaign,
7|  onSelectCampaign,
8|  onCreateCampaign,
9|  onEditCampaign,
10|  onDeleteCampaign,
11|  onViewStats,
12|  showDropdown,
13|  setShowDropdown
14|}) {
15|  const currentCampaign = campaigns.find(c => c.id === activeCampaign);
16|
17|  return (
18|    <div className="relative mb-4">
19|      <button
20|        onClick={() => setShowDropdown(!showDropdown)}
21|        className="w-full flex items-center justify-between px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
22|      >
23|        <div className="flex items-center">
24|          <Building className="w-5 h-5 mr-2" />
25|          <span>
26|            {currentCampaign
27|              ? `Campanha: ${currentCampaign.name}`
28|              : 'Selecionar Campanha'}
29|          </span>
30|        </div>
31|        <svg
32|          className={`w-5 h-5 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
33|          fill="none"
34|          stroke="currentColor"
35|          viewBox="0 0 24 24"
36|        >
37|          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
38|        </svg>
39|      </button>
40|
41|      {showDropdown && (
42|        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
43|          {campaigns.map(campaign => (
44|            <div
45|              key={campaign.id}
46|              className="flex items-center justify-between px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-600 last:border-b-0"
47|            >
48|              <button
49|                onClick={() => {
50|                  onSelectCampaign(campaign.id);
51|                  setShowDropdown(false);
52|                }}
53|                className={`flex-1 text-left ${activeCampaign === campaign.id ? 'text-blue-600 font-semibold' : 'text-gray-700 dark:text-gray-300'}`}
54|              >
55|                <div className="flex items-center">
56|                  <Building className="w-4 h-4 mr-2" />
57|                  <span>{campaign.name}</span>
58|                  {campaign.status === 'active' && (
59|                    <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Ativa</span>
60|                  )}
61|                  {activeCampaign === campaign.id && (
62|                    <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">Selecionada</span>
63|                  )}
64|                </div>
65|              </button>
66|              <div className="flex items-center space-x-1 ml-2">
67|                <button
68|                  onClick={(e) => {
69|                    e.stopPropagation();
70|                    onViewStats(campaign.id);
71|                    setShowDropdown(false);
72|                  }}
73|                  className="p-2 text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/20 rounded transition-colors"
74|                  title="Ver estatísticas"
75|                >
76|                  <BarChart2 className="w-4 h-4" />
77|                </button>
78|                <button
79|                  onClick={(e) => {
80|                    e.stopPropagation();
81|                    onEditCampaign(campaign);
82|                    setShowDropdown(false);
83|                  }}
84|                  className="p-2 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded transition-colors"
85|                  title="Editar campanha"
86|                >
87|                  <Edit className="w-4 h-4" />
88|                </button>
89|                <button
90|                  onClick={(e) => {
91|                    e.stopPropagation();
92|                    onDeleteCampaign(campaign.id);
93|                    setShowDropdown(false);
94|                  }}
95|                  className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-colors"
96|                  title="Excluir campanha"
97|                >
98|                  <Trash2 className="w-4 h-4" />
99|                </button>
100|              </div>
101|            </div>
102|          ))}
103|
104|          <button
105|            onClick={() => {
106|              onCreateCampaign();
107|              setShowDropdown(false);
108|            }}
109|            className="w-full flex items-center justify-center px-4 py-3 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-600 transition-colors"
110|          >
111|            <Plus className="w-5 h-5 mr-2" />
112|            <span>Nova Campanha</span>
113|          </button>
114|        </div>
115|      )}
116|    </div>
117|  );
118|}
