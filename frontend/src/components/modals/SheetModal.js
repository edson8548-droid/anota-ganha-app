import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';

export default function SheetModal({ isOpen, onClose, onSave, sheet }) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (sheet) {
      setName(sheet.name || '');
    } else {
      setName('');
    }
  }, [sheet, isOpen]);

  const handleSubmit = () => {
    if (name.trim()) {
      onSave({ name: name.trim() });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" data-testid="sheet-modal">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
            {sheet ? 'Editar Cidade' : 'Nova Cidade'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Nome da Cidade/Região
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            placeholder="Ex: São Paulo"
            autoFocus
          />
        </div>

        <div className="flex justify-end mt-6 space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 flex items-center"
            data-testid="save-sheet-btn"
          >
            <Save className="w-5 h-5 mr-2" />
            {sheet ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  );
}

