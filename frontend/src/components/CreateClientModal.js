import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import './CreateClientModal.css';

const CreateClientModal = ({ onClose, onSave, campaign }) => {
  const [cnpj, setCnpj] = useState('');
  const [searchingCNPJ, setSearchingCNPJ] = useState(false);
  const [clientData, setClientData] = useState({
    CLIENTE: '',
    TELEFONE: '',
    EMAIL: '',
    ENDERECO: '',
    CIDADE: '',
    ESTADO: '',
    BAIRRO: '',
    CEP: ''
  });
  const [positivations, setPositivations] = useState({});
  const [observations, setObservations] = useState('');
  const [loading, setLoading] = useState(false);

  // Inicializar produtos quando a campanha carregar
  useEffect(() => {
    console.log('🔄 Modal de cliente carregou com campanha:', campaign);
    
    if (campaign && campaign.industries) {
      const initialPositivations = {};
      
      Object.keys(campaign.industries).forEach(industryName => {
        const industry = campaign.industries[industryName];
        initialPositivations[industryName] = {
          products: {}
        };
        
        // Extrair produtos - suporta múltiplos formatos
        let products = [];
        if (typeof industry === 'object' && !Array.isArray(industry)) {
          // Formato: { "Produto1": { valor: 0, positivado: false }, "Produto2": ... }
          products = Object.keys(industry);
        } else if (Array.isArray(industry.products)) {
          // Formato: { products: ["Produto1", "Produto2"] }
          products = industry.products;
        } else if (Array.isArray(industry)) {
          // Formato: ["Produto1", "Produto2"]
          products = industry;
        }
        
        products.forEach(productName => {
          initialPositivations[industryName].products[productName] = {
            checked: false,
            value: 0
          };
        });
      });
      
      console.log('📦 Positivações inicializadas:', initialPositivations);
      setPositivations(initialPositivations);
    }
  }, [campaign]);

  // Formatar CNPJ para exibição
  const formatCNPJDisplay = (value) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length <= 14) {
      return cleaned
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    }
    return value;
  };

  // Formatar CNPJ final
  const formatCNPJFinal = (value) => {
    const cleaned = value.replace(/\D/g, '');
    return cleaned
      .replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  };

  const handleCNPJChange = (value) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length <= 14) {
      setCnpj(cleaned);
    }
  };

  const handleSearchCNPJ = async () => {
    if (!cnpj || cnpj.length !== 14) {
      toast.warning('⚠️ Digite um CNPJ válido com 14 dígitos');
      return;
    }

    setSearchingCNPJ(true);
    console.log('🔍 Buscando CNPJ:', cnpj);
    
    try {
      // Buscar na BrasilAPI (gratuita, sem chave)
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      
      if (!response.ok) {
        throw new Error('CNPJ não encontrado');
      }
      
      const data = await response.json();
      console.log('✅ Dados recebidos:', data);
      
      // Preencher dados do cliente
      setClientData({
        CLIENTE: data.razao_social || data.nome_fantasia || '',
        TELEFONE: data.ddd_telefone_1 || '',
        EMAIL: data.email || '',
        ENDERECO: `${data.logradouro || ''}, ${data.numero || ''}${data.complemento ? ' - ' + data.complemento : ''}`,
        CIDADE: data.municipio || '',
        ESTADO: data.uf || '',
        BAIRRO: data.bairro || '',
        CEP: data.cep || ''
      });

      toast.success('✅ Dados encontrados com sucesso!');
    } catch (error) {
      console.error('❌ Erro ao buscar CNPJ:', error);
      toast.warning('⚠️ Erro ao buscar CNPJ: ' + error.message + '\n\nPreencha os dados manualmente.');
    } finally {
      setSearchingCNPJ(false);
    }
  };

  const handleProductCheck = (industryName, productName, checked) => {
    console.log(`${checked ? '✅' : '⬜'} Produto ${productName} da ${industryName}`);
    setPositivations(prev => ({
      ...prev,
      [industryName]: {
        ...prev[industryName],
        products: {
          ...prev[industryName].products,
          [productName]: {
            ...prev[industryName].products[productName],
            checked: checked
          }
        }
      }
    }));
  };

  const handleProductValue = (industryName, productName, value) => {
    const numValue = parseFloat(value.replace(/[^\d]/g, '')) / 100 || 0;
    console.log(`💰 Valor do produto ${productName}: R$ ${numValue.toFixed(2)}`);
    setPositivations(prev => ({
      ...prev,
      [industryName]: {
        ...prev[industryName],
        products: {
          ...prev[industryName].products,
          [productName]: {
            ...prev[industryName].products[productName],
            value: numValue
          }
        }
      }
    }));
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const getIndustryStatus = (industryName) => {
    if (!positivations[industryName]) return { total: 0, checked: 0 };
    
    const products = positivations[industryName].products;
    const total = Object.keys(products).length;
    const checked = Object.values(products).filter(p => p.checked).length;
    
    return { total, checked };
  };

  const isIndustryPositivated = (industryName) => {
    const status = getIndustryStatus(industryName);
    return status.checked > 0;
  };

  const handleSubmit = async () => {
    console.log('💾 Tentando salvar cliente...');
    
    if (!cnpj) {
      toast.warning('⚠️ Digite o CNPJ do cliente');
      return;
    }

    if (!clientData.CLIENTE) {
      toast.warning('⚠️ Busque o CNPJ ou preencha o nome do cliente');
      return;
    }

    if (!clientData.CIDADE) {
      toast.warning('⚠️ Preencha a cidade do cliente');
      return;
    }

    // Formatar indústrias para o formato do banco
    const industriesFormatted = {};
    Object.keys(positivations).forEach(industryName => {
      const products = positivations[industryName].products;
      industriesFormatted[industryName] = {};
      
      Object.keys(products).forEach(productName => {
        industriesFormatted[industryName][productName] = {
          positivado: products[productName].checked,
          valor: products[productName].value
        };
      });
    });

    const clientDataToSave = {
      CNPJ: formatCNPJFinal(cnpj),
      CLIENTE: clientData.CLIENTE,
      TELEFONE: clientData.TELEFONE,
      EMAIL: clientData.EMAIL,
      ENDERECO: clientData.ENDERECO,
      CIDADE: clientData.CIDADE,
      ESTADO: clientData.ESTADO,
      BAIRRO: clientData.BAIRRO,
      CEP: clientData.CEP,
      industries: industriesFormatted,
      notes: observations
    };

    console.log('📤 Enviando dados do cliente:', clientDataToSave);

    setLoading(true);
    try {
      await onSave(clientDataToSave);
      console.log('✅ Cliente salvo com sucesso!');
    } catch (error) {
      console.error('❌ Erro ao salvar:', error);
    } finally {
      setLoading(false);
    }
  };

  // ⚡ SEMPRE RENDERIZA (removido o if (!isOpen) return null)
  return (
    <div className="modal-overlay-client" onClick={onClose}>
      <div className="modal-content-client" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="client-modal-header">
          <h2>➕ Novo Cliente</h2>
          <button className="btn-close-client" onClick={onClose} title="Fechar">×</button>
        </div>

        {/* Body */}
        <div className="client-modal-body">
          {/* CNPJ com Busca */}
          <div className="client-form-group">
            <label>CNPJ *</label>
            <div className="cnpj-search-wrapper">
              <input
                type="text"
                placeholder="00.000.000/0000-00"
                value={formatCNPJDisplay(cnpj)}
                onChange={(e) => handleCNPJChange(e.target.value)}
                disabled={loading || searchingCNPJ}
                maxLength={18}
              />
              <button
                className="btn-search-cnpj"
                onClick={handleSearchCNPJ}
                disabled={loading || searchingCNPJ || cnpj.length !== 14}
              >
                {searchingCNPJ ? '⏳ Buscando...' : '🔍 Buscar'}
              </button>
            </div>
            <small style={{ color: '#6b7280', fontSize: '12px', marginTop: '5px', display: 'block' }}>
              💡 Digite 14 números e clique em Buscar para preencher automaticamente
            </small>
          </div>

          {/* Dados do Cliente */}
          <div className="client-form-group">
            <label>Nome do Cliente *</label>
            <input
              type="text"
              placeholder="Nome ou Razão Social"
              value={clientData.CLIENTE}
              onChange={(e) => setClientData({ ...clientData, CLIENTE: e.target.value })}
              disabled={loading}
            />
          </div>

          <div className="client-form-group">
            <label>Endereço</label>
            <input
              type="text"
              placeholder="Rua, Número - Complemento"
              value={clientData.ENDERECO}
              onChange={(e) => setClientData({ ...clientData, ENDERECO: e.target.value })}
              disabled={loading}
            />
          </div>

          <div className="client-form-row">
            <div className="client-form-group">
              <label>Cidade *</label>
              <input
                type="text"
                placeholder="Cidade"
                value={clientData.CIDADE}
                onChange={(e) => setClientData({ ...clientData, CIDADE: e.target.value })}
                disabled={loading}
              />
            </div>
            <div className="client-form-group">
              <label>Bairro</label>
              <input
                type="text"
                placeholder="Bairro"
                value={clientData.BAIRRO}
                onChange={(e) => setClientData({ ...clientData, BAIRRO: e.target.value })}
                disabled={loading}
              />
            </div>
          </div>

          <div className="client-form-row">
            <div className="client-form-group">
              <label>Telefone</label>
              <input
                type="text"
                placeholder="(00) 00000-0000"
                value={clientData.TELEFONE}
                onChange={(e) => setClientData({ ...clientData, TELEFONE: e.target.value })}
                disabled={loading}
              />
            </div>
            <div className="client-form-group">
              <label>Email</label>
              <input
                type="email"
                placeholder="email@empresa.com"
                value={clientData.EMAIL}
                onChange={(e) => setClientData({ ...clientData, EMAIL: e.target.value })}
                disabled={loading}
              />
            </div>
          </div>

          {/* Produtos por Indústria */}
          {campaign && campaign.industries && Object.keys(campaign.industries).length > 0 && (
            <>
              <div className="client-divider"></div>
              <h3 className="section-title-client">📦 Produtos por Indústria</h3>
              <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '20px' }}>
                ✅ Marque os produtos que o cliente JÁ COMPROU e informe os valores
              </p>
              
              {Object.keys(campaign.industries).map(industryName => {
                const industry = campaign.industries[industryName];
                
                // Extrair produtos em diferentes formatos
                let products = [];
                if (typeof industry === 'object' && !Array.isArray(industry)) {
                  products = Object.keys(industry);
                } else if (Array.isArray(industry.products)) {
                  products = industry.products;
                } else if (Array.isArray(industry)) {
                  products = industry;
                }
                
                const status = getIndustryStatus(industryName);
                const isPositivated = isIndustryPositivated(industryName);

                return (
                  <div key={industryName} className={`industry-client-card ${isPositivated ? 'positivated' : ''}`}>
                    <div className="industry-client-header">
                      <div className="industry-client-title">
                        <div className={`industry-check-circle ${isPositivated ? 'checked' : ''}`}>
                          {isPositivated && '✓'}
                        </div>
                        <span>🏭 {industryName}</span>
                      </div>
                      <span className={`positivation-badge-client ${isPositivated ? 'positivated' : 'not-positivated'}`}>
                        {isPositivated ? '✓ Positivado' : 'Não Positivado'}
                      </span>
                    </div>

                    <div className="products-client-list">
                      {products.map(productName => {
                        const product = positivations[industryName]?.products[productName] || { checked: false, value: 0 };
                        
                        return (
                          <div key={productName} className={`product-client-item ${product.checked ? 'checked' : ''}`}>
                            <label className="product-client-checkbox">
                              <input
                                type="checkbox"
                                checked={product.checked}
                                onChange={(e) => handleProductCheck(industryName, productName, e.target.checked)}
                                disabled={loading}
                              />
                              <span className="checkbox-custom"></span>
                              <span className="product-client-name">{productName}</span>
                            </label>
                            
                            <div className="product-client-value">
                              <span className="currency-symbol-client">R$</span>
                              <input
                                type="text"
                                placeholder="0,00"
                                value={formatCurrency(product.value)}
                                onChange={(e) => handleProductValue(industryName, productName, e.target.value)}
                                disabled={loading}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Observações */}
          <div className="client-divider"></div>
          <div className="client-form-group">
            <label>Observações</label>
            <textarea
              placeholder="Observações adicionais sobre o cliente..."
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              disabled={loading}
              rows={3}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="client-modal-footer">
          <button
            className="btn-cancel-client"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            className="btn-save-client"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? '⏳ Salvando...' : '💾 Salvar Cliente'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateClientModal;