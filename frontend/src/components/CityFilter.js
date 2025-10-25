1|import React from 'react';
2|import { MapPin } from 'lucide-react';
3|
4|export default function CityFilter({
5|  cities,
6|  selectedCity,
7|  onSelectCity,
8|  showDropdown,
9|  setShowDropdown,
10|  clientCount
11|}) {
12|  const getCityLabel = () => {
13|    if (selectedCity === 'all') {
14|      return `Todas as Cidades (${clientCount} clientes)`;
15|    }
16|    const count = clientCount;
17|    return `${selectedCity} (${count} clientes)`;
18|  };
19|
20|  return (
21|    <div className="relative mb-4">
22|      <button
23|        onClick={() => setShowDropdown(!showDropdown)}
24|        className="w-full flex items-center justify-between px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold transition-colors"
25|      >
26|        <div className="flex items-center">
27|          <MapPin className="w-5 h-5 mr-2" />
28|          <span>{getCityLabel()}</span>
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
42|          {/* Todas as Cidades */}
43|          <button
44|            onClick={() => {
45|              onSelectCity('all');
46|              setShowDropdown(false);
47|            }}
48|            className={`w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-600 ${
49|              selectedCity === 'all' ? 'bg-teal-50 dark:bg-teal-900' : ''
50|            }`}
51|          >
52|            <div className="flex items-center justify-between">
53|              <div className="flex items-center">
54|                <MapPin className="w-4 h-4 mr-2 text-teal-600" />
55|                <span className={selectedCity === 'all' ? 'text-teal-600 font-semibold' : 'text-gray-700 dark:text-gray-300'}>
56|                  Todas as Cidades
57|                </span>
58|              </div>
59|              <span className="text-sm text-gray-500 dark:text-gray-400">
60|                {clientCount} clientes
61|              </span>
62|            </div>
63|          </button>
64|
65|          {/* Lista de Cidades */}
66|          {cities.length > 0 ? (
67|            cities.map(city => {
68|              // Contar clientes desta cidade
69|              const cityClientCount = clientCount; // Será passado pelo componente pai
70|              
71|              return (
72|                <button
73|                  key={city}
74|                  onClick={() => {
75|                    onSelectCity(city);
76|                    setShowDropdown(false);
77|                  }}
78|                  className={`w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-600 last:border-b-0 ${
79|                    selectedCity === city ? 'bg-teal-50 dark:bg-teal-900' : ''
80|                  }`}
81|                >
82|                  <div className="flex items-center justify-between">
83|                    <div className="flex items-center">
84|                      <MapPin className="w-4 h-4 mr-2 text-teal-600" />
85|                      <span className={selectedCity === city ? 'text-teal-600 font-semibold' : 'text-gray-700 dark:text-gray-300'}>
86|                        {city}
87|                      </span>
88|                      {selectedCity === city && (
89|                        <span className="ml-2 text-xs bg-teal-100 text-teal-600 px-2 py-1 rounded">Selecionada</span>
90|                      )}
91|                    </div>
92|                  </div>
93|                </button>
94|              );
95|            })
96|          ) : (
97|            <div className="px-4 py-3 text-gray-500 dark:text-gray-400 text-center">
98|              Nenhuma cidade encontrada
99|              <p className="text-xs mt-1">Cadastre clientes com cidades primeiro</p>
100|            </div>
101|          )}
102|        </div>
103|      )}
104|    </div>
105|  );
106|}
107|
