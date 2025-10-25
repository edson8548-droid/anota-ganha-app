import React, { useState, useEffect } from 'react';
import { X, Save, Search, CheckCircle, Circle } from 'lucide-react';

export default function ClientModalIndustries({ isOpen, onClose, onSave, client, campaign }) {
  const [formData, setFormData] = useState({
    CLIENTE: '',
    CNPJ: '',
    ENDERECO: '',
    CIDADE: '',
    BAIRRO: '',
    notes: '',
    industries: {}
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
        BAIRRO: client.BAIRRO || '',
        notes: client.notes || '',
        industries: client.industries || {}
      });
    } else {
      // Inicializar indústrias vazias baseado na campanha
      const initialIndustries = {};
      if (campaign?.industries) {
        campaign.industries.forEach(industry => {
          const industryProducts = {};
          industry.products.forEach(product => {
            industryProducts[product] = { status: '', value: 0 };
          });
          initialIndustries[industry.name] = {
            products: industryProducts,
            industry_status: ''
          };
        });
      }
      
      setFormData({
        CLIENTE: '',
        CNPJ: '',
        ENDERECO: '',
        CIDADE: '',
        BAIRRO: '',
        notes: '',
        industries: initialIndustries
      });
    }
    setCnpjError('');
  }, [client, campaign, isOpen]);

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
      
      if (!response.ok) {
        throw new Error('CNPJ não encontrado');
      }

      const data = await response.json();
      
      setFormData({
        ...formData,
        CLIENTE: data.razao_social || data.nome_fantasia || formData.CLIENTE,
        ENDERECO: `${data.logradouro || ''}, ${data.numero || ''} - ${data.bairro || ''}, ${data.municipio || ''} - ${data.uf || ''}`.trim(),
        CIDADE: data.municipio || formData.CIDADE,
        BAIRRO: data.bairro || formData.BAIRRO
      });

    } catch (error) {
      console.error('Erro ao buscar CNPJ:', error);
      setCnpjError('CNPJ não encontrado. Verifique o número e tente novamente.');
    } finally {
      setSearchingCNPJ(false);
    }
  };

  const updateProductInIndustry = (industryName, productName, field, value) => {
    const newIndustries = { ...formData.industries };
    
    if (!newIndustries[industryName]) {
      newIndustries[industryName] = { products: {}, industry_status: '' };
    }
    
    if (!newIndustries[industryName].products[productName]) {
      newIndustries[industryName].products[productName] = { status: '', value: 0 };
    }
    
    newIndustries[industryName].products[productName][field] = value;
    
    // Recalcular status da indústria
    const hasPositivado = Object.values(newIndustries[industryName].products).some(
      p => p.status?.toLowerCase() === 'positivado'
    );
    newIndustries[industryName].industry_status = hasPositivado ? 'positivado' : '';
    
    setFormData({ ...formData, industries: newIndustries });
  };

  const toggleProductStatus = (industryName, productName) => {
    const currentStatus = formData.industries[industryName]?.products[productName]?.status || '';
    const newStatus = currentStatus.toLowerCase() === 'positivado' ? '' : 'positivado';
    updateProductInIndustry(industryName, productName, 'status', newStatus);
  };

  const handleSubmit = () => {
    if (!formData.CLIENTE) {
      setCnpjError('Nome do cliente é obrigatório');
      return;
    }

    onSave({
      CLIENTE: formData.CLIENTE,
      CNPJ: formData.CNPJ,
      ENDERECO: formData.ENDERECO,
      CIDADE: formData.CIDADE,
      BAIRRO: formData.BAIRRO,
      notes: formData.notes,
      industries: formData.industries
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
            {client ? 'Editar Cliente' : 'Novo Cliente'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4">
          {/* CNPJ e Busca */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              CNPJ
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formData.CNPJ}
                onChange={(e) => setFormData({ ...formData, CNPJ: e.target.value })}
                className="flex-1 p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="00.000.000/0000-00"
              />
              <button
                onClick={searchCNPJ}
                disabled={searchingCNPJ}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 flex items-center"
              >
                <Search className="w-5 h-5 mr-1" />
                {searchingCNPJ ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
            {cnpjError && <p className="text-red-500 text-sm mt-1">{cnpjError}</p>}
          </div>

          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nome do Cliente *
            </label>
            <input
              type="text"
              value={formData.CLIENTE}
              onChange={(e) => setFormData({ ...formData, CLIENTE: e.target.value })}
              className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="Ex: Supermercado ABC"
              required
            />
          </div>

          {/* Endereço */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Endereço
            </label>
            <input
              type="text"
              value={formData.ENDERECO}
              onChange={(e) => setFormData({ ...formData, ENDERECO: e.target.value })}
              className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="Rua, número, bairro"
            />
          </div>

          {/* Cidade */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Cidade
            </label>
            <input
              type="text"
              value={formData.CIDADE}
              onChange={(e) => setFormData({ ...formData, CIDADE: e.target.value })}
              className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="Ex: São Paulo"
            />
          </div>

          {/* Bairro */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Bairro
            </label>
            <input
              type="text"
              value={formData.BAIRRO}
              onChange={(e) => setFormData({ ...formData, BAIRRO: e.target.value })}
              className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="Ex: Centro, Vila Mariana"
            />
          </div>

          {/* Produtos por Indústria */}
          <div className="border-t pt-4">
            <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Produtos por Indústria
            </h3>
            
            {campaign?.industries && campaign.industries.length > 0 ? (
              <div className="space-y-4">
                {campaign.industries.map((industry, industryIndex) => {
                  const industryData = formData.industries[industry.name] || { products: {}, industry_status: '' };
                  const isIndustryPositivado = industryData.industry_status?.toLowerCase() === 'positivado';
                  
                  return (
                    <div 
                      key={industryIndex}
                      className={`border-2 rounded-lg p-4 ${
                        isIndustryPositivado 
                          ? 'border-green-400 bg-green-50 dark:bg-green-900/20' 
                          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
                      }`}
                    >
                      {/* Cabeçalho da Indústria */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {isIndustryPositivado ? (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          ) : (
                            <Circle className="w-5 h-5 text-gray-400" />
                          )}
                          <h4 className="font-bold text-lg text-gray-900 dark:text-white">
                            {industry.name}
                          </h4>
                        </div>
                        <span className={`text-sm font-semibold px-3 py-1 rounded-full ${
                          isIndustryPositivado
                            ? 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200'
                            : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                        }`}>
                          {isIndustryPositivado ? '✓ Positivado' : 'Não Positivado'}
                        </span>
                      </div>

                      {/* Lista de Produtos */}
                      <div className="space-y-2">
                        {industry.products.map((product, productIndex) => {
                          const productData = industryData.products[product] || { status: '', value: 0 };
                          const isPositivado = productData.status?.toLowerCase() === 'positivado';
                          
                          return (
                            <div 
                              key={productIndex}
                              className={`flex items-center gap-2 p-3 rounded-md border ${
                                isPositivado
                                  ? 'border-green-300 bg-green-100 dark:bg-green-900/30'
                                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
                              }`}
                            >
                              {/* Checkbox/Status */}
                              <button
                                type="button"
                                onClick={() => toggleProductStatus(industry.name, product)}
                                className={`flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                                  isPositivado
                                    ? 'bg-green-600 border-green-600'
                                    : 'bg-white border-gray-300 hover:border-green-600'
                                }`}
                              >
                                {isPositivado && <CheckCircle className="w-5 h-5 text-white" />}
                              </button>

                              {/* Nome do Produto */}
                              <span className="flex-1 font-medium text-gray-900 dark:text-white">
                                {product}
                              </span>

                              {/* Campo de Valor */}
                              <div className="flex items-center gap-1">
                                <span className="text-sm text-gray-500 dark:text-gray-400">R$</span>
                                <input
                                  type="number"
                                  value={productData.value || 0}
                                  onChange={(e) => updateProductInIndustry(
                                    industry.name, 
                                    product, 
                                    'value', 
                                    parseFloat(e.target.value) || 0
                                  )}
                                  className="w-28 p-1.5 border rounded-md text-right dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                                  step="0.01"
                                  min="0"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                Nenhuma indústria cadastrada nesta campanha
              </div>
            )}
          </div>

          {/* Observações */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Observações
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              rows="3"
              placeholder="Observações adicionais..."
            />
          </div>
        </div>

        {/* Botões */}
        <div className="flex justify-end mt-6 space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formData.CLIENTE}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 flex items-center"
          >
            <Save className="w-5 h-5 mr-2" />
            {client ? 'Salvar' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  );
}