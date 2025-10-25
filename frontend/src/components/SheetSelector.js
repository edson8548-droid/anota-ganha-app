1|import React from 'react';
2|import { MapPin, Plus, Edit, Trash2 } from 'lucide-react';
3|
4|export default function SheetSelector({
5|  sheets,
6|  activeSheet,
7|  onSelectSheet,
8|  onCreateSheet,
9|  onEditSheet,
10|  onDeleteSheet,
11|  showDropdown,
12|  setShowDropdown
13|}) {
14|  const currentSheet = sheets.find(s => s.id === activeSheet);
15|
16|  return (
17|    <div className="relative mb-4">
18|      <button
19|        onClick={() => setShowDropdown(!showDropdown)}
20|        className="w-full flex items-center justify-between px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold transition-colors"
21|      >
22|        <div className="flex items-center">
23|          <MapPin className="w-5 h-5 mr-2" />
24|          <span>
25|            {currentSheet
26|              ? `Cidade: ${currentSheet.name}`
27|              : 'Selecionar Cidade'}
28|          </span>
29|        </div>
30|        <svg
31|          className={`w-5 h-5 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
32|          fill="none"
33|          stroke="currentColor"
34|          viewBox="0 0 24 24"
35|        >
36|          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
37|        </svg>
38|      </button>
39|
40|      {showDropdown && (
41|        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
42|          {sheets.map(sheet => (
43|            <div
44|              key={sheet.id}
45|              className="flex items-center justify-between px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-600 last:border-b-0"
46|            >
47|              <button
48|                onClick={() => {
49|                  onSelectSheet(sheet.id);
50|                  setShowDropdown(false);
51|                }}
52|                className={`flex-1 text-left ${activeSheet === sheet.id ? 'text-blue-600 font-semibold' : 'text-gray-700 dark:text-gray-300'}`}
53|              >
54|                <div className="flex items-center">
55|                  <MapPin className="w-4 h-4 mr-2" />
56|                  <span>{sheet.name}</span>
57|                  {activeSheet === sheet.id && (
58|                    <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">Ativa</span>
59|                  )}
60|                </div>
61|              </button>
62|              <div className="flex items-center space-x-1 ml-2">
63|                <button
64|                  onClick={(e) => {
65|                    e.stopPropagation();
66|                    onEditSheet(sheet);
67|                    setShowDropdown(false);
68|                  }}
69|                  className="p-1 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded transition-colors"
70|                  title="Editar cidade"
71|                >
72|                  <Edit className="w-4 h-4" />
73|                </button>
74|                <button
75|                  onClick={(e) => {
76|                    e.stopPropagation();
77|                    onDeleteSheet(sheet.id);
78|                    setShowDropdown(false);
79|                  }}
80|                  className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-colors"
81|                  title="Excluir cidade"
82|                >
83|                  <Trash2 className="w-4 h-4" />
84|                </button>
85|              </div>
86|            </div>
87|          ))}
88|
89|          <button
90|            onClick={() => {
91|              onCreateSheet();
92|              setShowDropdown(false);
93|            }}
94|            className="w-full flex items-center justify-center px-4 py-3 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-600 transition-colors"
95|          >
96|            <Plus className="w-5 h-5 mr-2" />
97|            <span>Nova Cidade</span>
98|          </button>
99|        </div>
100|      )}
101|    </div>
102|  );
103|}
