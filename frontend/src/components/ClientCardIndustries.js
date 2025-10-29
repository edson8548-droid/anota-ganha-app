import React from 'react';
import { Edit, Trash2, FileText, MapPin, CheckCircle, Circle, ChevronDown, ChevronUp } from 'lucide-react';

export default function ClientCardIndustries({ client, campaign, onEdit, onDelete, onUpdateProduct }) {
  const [expandedIndustries, setExpandedIndustries] = React.useState({});

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const toggleIndustry = (industryName) => {
    setExpandedIndustries(prev => ({
      ...prev,
      [industryName]: !prev[industryName]
    }));
  };

  const handleProductToggle = (industryName, productName) => {
    const currentProduct = client.industries?.[industryName]?.products?.[productName] || { status: '', value: 0 };
    const newStatus = currentProduct.status?.toLowerCase() === 'positivado' ? '' : 'positivado';
    
    onUpdateProduct(client.id, industryName, productName, {
      status: newStatus,
      value: currentProduct.value || 0
    });
  };

  const handleValueChange = (industryName, productName, newValue) => {
    const currentProduct = client.industries?.[industryName]?.products?.[productName] || { status: '', value: 0 };
    
    onUpdateProduct(client.id, industryName, productName, {
      status: currentProduct.status,
      value: parseFloat(newValue) || 0
    });
  };

  // Calcular totais
  const calculateIndustryTotal = (industryName) => {
    const industryData = client.industries?.[industryName];
    if (!industryData?.products) return 0;
    
    return Object.values(industryData.products).reduce((sum, product) => {
      return sum + (parseFloat(product.value) || 0);
    }, 0);
  };

  const calculatePositivadosCount = (industryName) => {
    const industryData = client.industries?.[industryName];
    if (!industryData?.products) return { positivados: 0, total: 0 };
    
    const products = Object.values(industryData.products);
    const positivados = products.filter(p => p.status?.toLowerCase() === 'positivado').length;
    
    return { positivados, total: products.length };
  };

  // Verificar se TODOS os produtos de TODAS as indústrias estão positivados
  const checkAllProductsPositivated = () => {
    if (!client.industries || !campaign?.industries) return false;
    
    let totalProducts = 0;
    let totalPositivated = 0;
    
    // Iterar sobre as indústrias da campanha
    campaign.industries.forEach(campaignIndustry => {
      const industryName = campaignIndustry.name.toLowerCase();
      const clientIndustry = Object.keys(client.industries).find(
        key => key.toLowerCase() === industryName
      );
      
      if (clientIndustry && client.industries[clientIndustry]?.products) {
        const products = client.industries[clientIndustry].products;
        Object.values(products).forEach(product => {
          totalProducts++;
          if (product.status?.toLowerCase() === 'positivado') {
            totalPositivated++;
          }
        });
      }
    });
    
    return totalProducts > 0 && totalProducts === totalPositivated;
  };

  const isFullyPositivated = checkAllProductsPositivated();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden relative" data-testid="client-card">
      {/* Badge de Parabéns - 100% Positivado */}
      {isFullyPositivated && (
        <div className="absolute top-2 right-2 z-10 bg-green-500 text-white px-3 py-1 rounded-full shadow-lg flex items-center space-x-1 animate-pulse">
          <span className="text-lg">🎉</span>
          <span className="text-xs font-bold">100%</span>
        </div>
      )}
      
      {/* Header - Compacto */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-700 dark:to-blue-800 p-2">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0 mr-2">
            <h2 className="text-base md:text-lg font-bold text-white truncate" title={client.CLIENTE}>
              {client.CLIENTE}
            </h2>
            {client.CIDADE && (
              <div className="flex items-center mt-0.5">
                <MapPin className="w-3 h-3 mr-1 text-blue-100" />
                <span className="text-xs text-blue-100 font-medium">
                  {client.CIDADE}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-1 flex-shrink-0">
            <button
              onClick={() => onEdit(client)}
              className="p-1.5 text-white hover:bg-white/20 rounded-full transition-colors"
              title="Editar Cliente"
              data-testid="edit-client-btn"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(client.id)}
              className="p-1.5 text-white hover:bg-white/20 rounded-full transition-colors"
              title="Excluir Cliente"
              data-testid="delete-client-btn"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Client Info - Mais compacto */}
      {(client.CNPJ || client.ENDERECO) && (
        <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
            {client.CNPJ && (
              <div className="flex items-center truncate">
                <FileText className="w-3 h-3 mr-1 flex-shrink-0" />
                <span className="truncate">{client.CNPJ}</span>
              </div>
            )}
            {client.ENDERECO && (
              <div className="flex items-center truncate">
                <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                <span className="truncate">{client.ENDERECO}</span>

Action: file_editor view /app/frontend/src/components/ClientCardIndustries.js
Observation: /app/frontend/src/components/ClientCardIndustries.js:
              </div>
            )}
          </div>
        </div>
      )}

      {/* Industries List - Compacto */}
      <div className="p-2 space-y-2">
        {client.industries && Object.keys(client.industries).length > 0 ? (
          Object.entries(client.industries).map(([industryName, industryData], index) => {
            const isIndustryPositivado = industryData.industry_status?.toLowerCase() === 'positivado';
            const isExpanded = expandedIndustries[industryName];
            const industryTotal = calculateIndustryTotal(industryName);
            const { positivados, total } = calculatePositivadosCount(industryName);
            
            // Buscar dados da indústria na campanha
            const campaignIndustry = campaign?.industries?.find(ind => ind.name === industryName);
            if (!campaignIndustry) return null;

            return (
              <div
                key={index}
                className={`border-2 rounded-lg overflow-hidden transition-all ${
                  isIndustryPositivado
                    ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50'
                }`}
              >
                {/* Industry Header - Compacto */}
                <button
                  onClick={() => toggleIndustry(industryName)}
                  className="w-full p-2 flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {isIndustryPositivado ? (
                      <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    )}
                    <div className="text-left flex-1 min-w-0">
                      <h3 className="font-bold text-sm text-gray-900 dark:text-white truncate">
                        {industryName}
                      </h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {positivados}/{total} • {formatCurrency(industryTotal)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      isIndustryPositivado
                        ? 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200'
                        : 'bg-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                      {isIndustryPositivado ? '✓' : '✗'}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </button>

                {/* Products List (Expandable) - Compacto */}
                {isExpanded && (
                  <div className="border-t border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/30 p-2 space-y-1.5">
                    {campaignIndustry.products.map((productName, pIndex) => {
                      const productData = industryData.products[productName] || { status: '', value: 0 };
                      const isPositivado = productData.status?.toLowerCase() === 'positivado';

                      return (
                        <div
                          key={pIndex}
                          className={`flex items-center gap-2 p-2 rounded-md border ${
                            isPositivado
                              ? 'border-green-300 bg-green-100 dark:bg-green-900/30'
                              : 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800'
                          }`}
                        >
                          {/* Checkbox */}
                          <button
                            onClick={() => handleProductToggle(industryName, productName)}
                            className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                              isPositivado
                                ? 'bg-green-600 border-green-600'
                                : 'bg-white dark:bg-gray-700 border-gray-400 hover:border-green-600'
                            }`}
                          >
                            {isPositivado && <CheckCircle className="w-4 h-4 text-white" />}
                          </button>

                          {/* Product Name */}
                          <span className="flex-1 text-xs md:text-sm font-medium text-gray-900 dark:text-white truncate">
                            {productName}
                          </span>

                          {/* Value Input */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-xs text-gray-500 dark:text-gray-400">R$</span>
                            <input
                              type="number"
                              value={productData.value || 0}
                              onChange={(e) => handleValueChange(industryName, productName, e.target.value)}
                              className="w-16 md:w-20 px-1 py-1 border rounded-md text-right text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                              step="0.01"
                              min="0"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
            Nenhuma indústria cadastrada
          </div>
        )}
      </div>

      {/* Notes - Compacto */}
      {client.notes && (
        <div className="px-2 pb-2">
          <div className="text-xs text-gray-600 dark:text-gray-400 bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded border border-yellow-200 dark:border-yellow-800">
            <strong>Obs:</strong> {client.notes}
          </div>
        </div>
      )}
    </div>
  );
}


