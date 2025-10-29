import React, { useState } from 'react';
import { X, Plus, Trash2, Edit2, Check } from 'lucide-react';

export default function IndustryManager({ industries, onChange }) {
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingProduct, setEditingProduct] = useState({ industryIndex: null, productIndex: null });
  const [focusedGoalIndex, setFocusedGoalIndex] = useState(null);

  const formatCurrency = (value) => {
    const numValue = parseFloat(value) || 0;
    return numValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const addIndustry = () => {
    onChange([...industries, { name: '', goal: 0, products: [] }]);
    setEditingIndex(industries.length);
  };

  const removeIndustry = (index) => {
    const newIndustries = industries.filter((_, i) => i !== index);
    onChange(newIndustries);
  };

  const updateIndustry = (index, field, value) => {
    const newIndustries = [...industries];
    if (field === 'goal') {
      const numericValue = parseFloat(value) || 0;
      newIndustries[index][field] = numericValue;
    } else {
      newIndustries[index][field] = value;
    }
    onChange(newIndustries);
  };

  const addProduct = (industryIndex) => {
    const newIndustries = [...industries];
    newIndustries[industryIndex].products.push('');
    onChange(newIndustries);
    setEditingProduct({ industryIndex, productIndex: newIndustries[industryIndex].products.length - 1 });
  };

  const removeProduct = (industryIndex, productIndex) => {
    const newIndustries = [...industries];
    newIndustries[industryIndex].products = newIndustries[industryIndex].products.filter((_, i) => i !== productIndex);
    onChange(newIndustries);
  };

  const updateProduct = (industryIndex, productIndex, value) => {
    const newIndustries = [...industries];
    newIndustries[industryIndex].products[productIndex] = value;
    onChange(newIndustries);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Indústrias e Produtos</h3>
        <button
          onClick={addIndustry}
          className="flex items-center px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
        >
          <Plus className="w-4 h-4 mr-1" />
          Adicionar Indústria
        </button>
      </div>

      {industries.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400 border-2 border-dashed rounded-lg">
          <p>Nenhuma indústria cadastrada</p>
          <p className="text-sm mt-1">Clique em "Adicionar Indústria" para começar</p>
        </div>
      ) : (
        <div className="space-y-4">
          {industries.map((industry, industryIndex) => (
            <div key={industryIndex} className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-700">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                      Nome da Indústria *
                    </label>
                    {editingIndex === industryIndex ? (
                      <input
                        type="text"
                        value={industry.name}
                        onChange={(e) => updateIndustry(industryIndex, 'name', e.target.value)}
                        onBlur={() => setEditingIndex(null)}
                        autoFocus
                        className="w-full px-3 py-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                        placeholder="Ex: Cervejaria"
                      />
                    ) : (
                      <div
                        onClick={() => setEditingIndex(industryIndex)}
                        className="px-3 py-2 border rounded-md cursor-pointer hover:bg-white dark:hover:bg-gray-600 dark:border-gray-500"
                      >
                        {industry.name || <span className="text-gray-400">Clique para editar</span>}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                      Meta (R$) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={industry.goal}
                      onChange={(e) => updateIndustry(industryIndex, 'goal', e.target.value)}
                      onFocus={() => setFocusedGoalIndex(industryIndex)}
                      onBlur={() => setFocusedGoalIndex(null)}
                      className="w-full px-3 py-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                      placeholder="0.00"
                    />
                    {focusedGoalIndex !== industryIndex && (
                      <p className="text-xs text-gray-500 mt-1">
                        R$ {formatCurrency(industry.goal)}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => removeIndustry(industryIndex)}
                  className="ml-3 p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900 rounded"
                  title="Remover Indústria"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="border-t pt-3 mt-3">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Produtos ({industry.products.length})
                  </label>
                  <button
                    onClick={() => addProduct(industryIndex)}
                    className="flex items-center px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Produto
                  </button>
                </div>

                {industry.products.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 py-2">
                    Nenhum produto cadastrado
                  </p>
                ) : (
                  <div className="space-y-2">
                    {industry.products.map((product, productIndex) => (
                      <div key={productIndex} className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500 w-6">{productIndex + 1}.</span>
                        {editingProduct.industryIndex === industryIndex && editingProduct.productIndex === productIndex ? (
                          <input
                            type="text"
                            value={product}
                            onChange={(e) => updateProduct(industryIndex, productIndex, e.target.value)}
                            onBlur={() => setEditingProduct({ industryIndex: null, productIndex: null })}
                            autoFocus
                            className="flex-1 px-2 py-1 border rounded text-sm dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                            placeholder="Nome do produto"
                          />
                        ) : (
                          <div
                            onClick={() => setEditingProduct({ industryIndex, productIndex })}
                            className="flex-1 px-2 py-1 border rounded text-sm cursor-pointer hover:bg-white dark:hover:bg-gray-600 dark:border-gray-500"
                          >
                            {product || <span className="text-gray-400">Clique para editar</span>}
                          </div>
                        )}
                        <button
                          onClick={() => removeProduct(industryIndex, productIndex)}
                          className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900 rounded"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {industries.length > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          <p>💡 Dica: Clique nos campos para editar. As metas são valores em Reais (R$).</p>
        </div>
      )}
    </div>
  );
}
