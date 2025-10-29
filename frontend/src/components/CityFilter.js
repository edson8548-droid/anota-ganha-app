import React from 'react';
import { MapPin } from 'lucide-react';

export default function CityFilter({
  cities,
  selectedCity,
  onSelectCity,
  showDropdown,
  setShowDropdown,
  clientCount
}) {
  const getCityLabel = () => {
    if (selectedCity === 'all') {
      return `Todas as Cidades (${clientCount} clientes)`;
    }
    const count = clientCount;
    return `${selectedCity} (${count} clientes)`;
  };

  return (
    <div className="relative mb-4">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="w-full flex items-center justify-between px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold transition-colors"
      >
        <div className="flex items-center">
          <MapPin className="w-5 h-5 mr-2" />
          <span>{getCityLabel()}</span>
        </div>
        <svg
          className={`w-5 h-5 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
          {/* Todas as Cidades */}
          <button
            onClick={() => {
              onSelectCity('all');
              setShowDropdown(false);
            }}
            className={`w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-600 ${
              selectedCity === 'all' ? 'bg-teal-50 dark:bg-teal-900' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <MapPin className="w-4 h-4 mr-2 text-teal-600" />
                <span className={selectedCity === 'all' ? 'text-teal-600 font-semibold' : 'text-gray-700 dark:text-gray-300'}>
                  Todas as Cidades
                </span>
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {clientCount} clientes
              </span>
            </div>
          </button>

          {/* Lista de Cidades */}
          {cities.length > 0 ? (
            cities.map(city => {
              // Contar clientes desta cidade
              const cityClientCount = clientCount; // Será passado pelo componente pai
              
              return (
                <button
                  key={city}
                  onClick={() => {
                    onSelectCity(city);
                    setShowDropdown(false);
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-600 last:border-b-0 ${
                    selectedCity === city ? 'bg-teal-50 dark:bg-teal-900' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <MapPin className="w-4 h-4 mr-2 text-teal-600" />
                      <span className={selectedCity === city ? 'text-teal-600 font-semibold' : 'text-gray-700 dark:text-gray-300'}>
                        {city}
                      </span>
                      {selectedCity === city && (
                        <span className="ml-2 text-xs bg-teal-100 text-teal-600 px-2 py-1 rounded">Selecionada</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="px-4 py-3 text-gray-500 dark:text-gray-400 text-center">
              Nenhuma cidade encontrada
              <p className="text-xs mt-1">Cadastre clientes com cidades primeiro</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

