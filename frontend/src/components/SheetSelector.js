import React from 'react';
import { MapPin, Plus, Edit, Trash2 } from 'lucide-react';

export default function SheetSelector({
  sheets,
  activeSheet,
  onSelectSheet,
  onCreateSheet,
  onEditSheet,
  onDeleteSheet,
  showDropdown,
  setShowDropdown
}) {
  const currentSheet = sheets.find(s => s.id === activeSheet);

  return (
    <div className="relative mb-4">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="w-full flex items-center justify-between px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold transition-colors"
      >
        <div className="flex items-center">
          <MapPin className="w-5 h-5 mr-2" />
          <span>
            {currentSheet
              ? `Cidade: ${currentSheet.name}`
              : 'Selecionar Cidade'}
          </span>
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
          {sheets.map(sheet => (
            <div
              key={sheet.id}
              className="flex items-center justify-between px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-600 last:border-b-0"
            >
              <button
                onClick={() => {
                  onSelectSheet(sheet.id);
                  setShowDropdown(false);
                }}
                className={`flex-1 text-left ${activeSheet === sheet.id ? 'text-blue-600 font-semibold' : 'text-gray-700 dark:text-gray-300'}`}
              >
                <div className="flex items-center">
                  <MapPin className="w-4 h-4 mr-2" />
                  <span>{sheet.name}</span>
                  {activeSheet === sheet.id && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">Ativa</span>
                  )}
                </div>
              </button>
              <div className="flex items-center space-x-1 ml-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditSheet(sheet);
                    setShowDropdown(false);
                  }}
                  className="p-1 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded transition-colors"
                  title="Editar cidade"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSheet(sheet.id);
                    setShowDropdown(false);
                  }}
                  className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-colors"
                  title="Excluir cidade"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={() => {
              onCreateSheet();
              setShowDropdown(false);
            }}
            className="w-full flex items-center justify-center px-4 py-3 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-600 transition-colors"
          >
            <Plus className="w-5 h-5 mr-2" />
            <span>Nova Cidade</span>
          </button>
        </div>
      )}
    </div>
  );
}
