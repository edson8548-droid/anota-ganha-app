import React, { useState, useEffect } from 'react';
import { X, Save, UserPlus, Search } from 'lucide-react';

export default function ClientModal({ isOpen, onClose, onSave, client, headers }) {
  const [formData, setFormData] = useState({
    CLIENTE: '',
    CNPJ: '',
    ENDERECO: '',
    CIDADE: '',
    notes: '',
    products: {}
  });
  const [searchingCNPJ, setSearchingCNPJ] = useState(false);
  const [cnpjError, setCnpjError] = useState('');

  useEffect(() => {
    if (client) {
      setFormData({
        CLIENTE: client.CLIENTE || '',
        CNPJ: client.CNPJ || '',
        ENDERECO: client.ENDERECO || '',
        CIDADE: client.CIDADE || '',
        notes: client.notes || '',
        products: client.products || {}
      });
    } else {
      const initialProducts = {};
      headers.forEach(h => {
        initialProducts[h] = { status: '', value: 0 };
      });
      setFormData({
        CLIENTE: '',
        CNPJ: '',
        ENDERECO: '',
        CIDADE: '',
        notes: '',
        products: initialProducts
      });
    }
    setCnpjError('');
  }, [client, headers, isOpen]);

  const searchCNPJ = async () => {
    const cnpj = formData.CNPJ.replace(/\D/g, '');
    if (cnpj.length !== 14) {
      setCnpjError('CNPJ inválido. Deve conter 14 dígitos.');
      return;
    }

    setSearchingCNPJ(true);
    setCnpjError('');

    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!response.ok) throw new Error('CNPJ não encontrado');
      
      const data = await response.json();
      
      // Log para debug
      console.log('Dados retornados da API:', data);
      console.log('Município:', data.municipio);
      
      const newFormData = {
        ...formData,
        CLIENTE: data.razao_social || '',
        ENDERECO: `${data.logradouro || ''}, ${data.numero || ''} - ${data.bairro || ''}`,
        CIDADE: data.municipio || ''
      };
      
      console.log('Novo formData:', newFormData);
      setFormData(newFormData);
      
      // Feedback visual
      if (data.municipio) {
        alert(`✅ Dados encontrados!\nEmpresa: ${data.razao_social}\nCidade: ${data.municipio}`);
      }
    } catch (error) {
      console.error('Erro na busca:', error);
      setCnpjError('CNPJ não encontrado ou API indisponível.');
    } finally {
      setSearchingCNPJ(false);
    }
  };

  const handleSubmit = () => {
    if (!formData.CLIENTE.trim()) return;
    onSave(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4" data-testid="client-modal">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
            {client ? 'Editar Cliente' : 'Novo Cliente'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4">
          {/* CNPJ Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              CNPJ
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={formData.CNPJ}
                onChange={(e) => setFormData({ ...formData, CNPJ: e.target.value })}
                className="flex-1 p-3 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="00.000.000/0000-00"
              />
              <button
                onClick={searchCNPJ}
                disabled={searchingCNPJ}
                className="px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-400 flex items-center"
                title="Buscar dados da empresa e preencher automaticamente"
              >
                {searchingCNPJ ? (
                  <span className="animate-spin">⏳</span>
                ) : (
                  <>
                    <Search className="w-5 h-5 mr-1" />
                    Buscar
                  </>
                )}
              </button>
            </div>
            {cnpjError && <p className="text-red-500 text-sm mt-1">{cnpjError}</p>}
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              ✨ Ao buscar, preencheremos: Nome, Endereço e <strong>CIDADE</strong> automaticamente!
            </p>
          </div>

          {/* Cliente Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nome do Cliente *
            </label>
            <input
              type="text"
              value={formData.CLIENTE}
              onChange={(e) => setFormData({ ...formData, CLIENTE: e.target.value })}
              className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="Nome completo"
              required
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Endereço
            </label>
            <input
              type="text"
              value={formData.ENDERECO}
              onChange={(e) => setFormData({ ...formData, ENDERECO: e.target.value })}
              className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="Endereço completo"
            />
          </div>

          {/* City */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Cidade * 🏙️
            </label>
            <input
              type="text"
              value={formData.CIDADE}
              onChange={(e) => setFormData({ ...formData, CIDADE: e.target.value })}
              className="w-full p-3 border-2 border-blue-300 dark:border-blue-600 rounded-md bg-blue-50 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-blue-500"
              placeholder="Ex: São Paulo, Iguape, etc"
              required
            />
            <div className="mt-2 p-2 bg-blue-100 dark:bg-blue-900 rounded text-xs">
              <p className="text-blue-800 dark:text-blue-200 font-semibold">
                💡 Dica: A cidade é preenchida automaticamente ao buscar por CNPJ!
              </p>
              <p className="text-blue-700 dark:text-blue-300 mt-1">
                1. Digite o CNPJ acima<br/>
                2. Clique no botão de busca 🔍<br/>
                3. A cidade será preenchida automaticamente
              </p>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Observações
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full p-3 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="Anotações sobre o cliente"
              rows="3"
            />
          </div>

          {/* Products Initial Values */}
          {!client && headers.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Produtos (opcional)
              </h3>
              <p className="text-sm text-gray-500 mb-3">
                Você pode adicionar valores iniciais ou deixar em branco
              </p>
              <div className="grid grid-cols-2 gap-3">
                {headers.map(header => (
                  <div key={header}>
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      {header}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.products[header]?.value || 0}
                      onChange={(e) => setFormData({
                        ...formData,
                        products: {
                          ...formData.products,
                          [header]: {
                            ...formData.products[header],
                            value: parseFloat(e.target.value) || 0
                          }
                        }
                      })}
                      className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                      placeholder="R$ 0,00"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
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
            disabled={!formData.CLIENTE.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 flex items-center"
            data-testid="save-client-btn"
          >
            {client ? <Save className="w-5 h-5 mr-2" /> : <UserPlus className="w-5 h-5 mr-2" />}
            {client ? 'Salvar' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  );
}


