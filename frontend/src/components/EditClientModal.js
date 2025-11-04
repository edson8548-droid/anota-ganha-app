// SUBSTITUA: src/components/EditClientModal.js
// ALTERADO: O título agora é "Positivar Produtos"

import React, { useState, useEffect } from 'react';
import './EditClientModal.css'; 

const EditClientModal = ({ isOpen, onClose, client, onSave, campaign }) => {
  const [formData, setFormData] = useState({
    CNPJ: '', CLIENTE: '', CIDADE: '', ESTADO: '',
    ENDERECO: '', BAIRRO: '', CEP: '', TELEFONE: '',
    EMAIL: '', industries: {}, notes: ''
  });

  const [selectAll, setSelectAll] = useState({});
  const [totalValue, setTotalValue] = useState(0);
  const [progressByIndustry, setProgressByIndustry] = useState({});

  // Hook para carregar e mesclar dados (Lógica mantida)
  useEffect(() => {
    if (client && campaign && isOpen) {
      const hydratedIndustries = {};
      if (campaign.industries) {
        Object.entries(campaign.industries).forEach(([industryName, products]) => {
          hydratedIndustries[industryName] = {};
          Object.keys(products).filter(p => p !== 'targetValue').forEach(productName => {
            const clientProductData = client.industries?.[industryName]?.[productName];
            if (clientProductData) {
              hydratedIndustries[industryName][productName] = {
                valor: clientProductData.valor || 0,
                positivado: clientProductData.positivado || false,
              };
            } else {
              hydratedIndustries[industryName][productName] = {
                valor: 0,
                positivado: false,
              };
            }
          });
        });
      }
      setFormData({
        CNPJ: client.CNPJ || '', CLIENTE: client.CLIENTE || '',
        CIDADE: client.CIDADE || '', ESTADO: client.ESTADO || '',
        ENDERECO: client.ENDERECO || '', BAIRRO: client.BAIRRO || '',
        CEP: client.CEP || '', TELEFONE: client.TELEFONE || '',
        EMAIL: client.EMAIL || '', notes: client.notes || '',
        industries: hydratedIndustries,
      });
    }
  }, [client, campaign, isOpen]);

  // Hook para calcular totais (Lógica mantida)
  useEffect(() => {
    let total = 0;
    const progress = {};
    if (formData.industries) {
      Object.entries(formData.industries).forEach(([industryName, products]) => {
        let industryTotal = 0;
        let positivatedCount = 0;
        let totalProducts = 0;
        Object.entries(products).forEach(([productName, productData]) => {
          totalProducts++;
          if (productData.positivado) {
            positivatedCount++;
            const value = parseFloat(productData.valor) || 0;
            industryTotal += value;
            total += value;
          }
        });
        progress[industryName] = {
          percentage: totalProducts > 0 ? (positivatedCount / totalProducts) * 100 : 0,
          positivated: positivatedCount,
          total: totalProducts,
          value: industryTotal
        };
      });
    }
    setTotalValue(total);
    setProgressByIndustry(progress);
  }, [formData.industries]);

  // Handlers (Lógica mantida)
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleProductChange = (industryName, productName, field, value) => {
    setFormData(prev => {
        const newFormData = { ...prev };
        const product = newFormData.industries[industryName][productName];
        if (field === 'positivado' && value === false) {
            product.valor = 0;
        }
        product[field] = field === 'valor' ? parseFloat(value) || 0 : value;
        return newFormData;
    });
  };

  const handleSelectAll = (industryName) => {
    const newValue = !selectAll[industryName];
    setSelectAll(prev => ({ ...prev, [industryName]: newValue }));
    setFormData(prev => {
      const updatedIndustry = { ...prev.industries[industryName] };
      Object.keys(updatedIndustry).forEach(productName => {
        updatedIndustry[productName] = {
          ...updatedIndustry[productName],
          positivado: newValue,
          valor: newValue ? updatedIndustry[productName].valor : 0
        };
      });
      return { ...prev, industries: { ...prev.industries, [industryName]: updatedIndustry } };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...client, ...formData });
    onClose();
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="edit-client-modal" onClick={(e) => e.stopPropagation()}>
        
        {/* ============================================ */}
        {/* ⭐️ MUDANÇA FEITA AQUI ⭐️ */}
        {/* ============================================ */}
        <div className="modal-header-edit">
          <div className="modal-header-content">
            <h2>🏭 Positivar Produtos</h2>
            <p>Marque os produtos positivados e insira os valores</p>
          </div>
          <button className="btn-close-edit" onClick={onClose}>
            ✕
          </button>
        </div>
        {/* ============================================ */}
        {/* ⭐️ FIM DA MUDANÇA ⭐️ */}
        {/* ============================================ */}

        <form onSubmit={handleSubmit} className="modal-body-edit">
          {/* Informações do Cliente (agora escondidas, mas mantidas para dados) */}
          <div className="section-edit" style={{ display: 'none' }}>
            <h3 className="section-title-edit">
              <span className="section-icon">📋</span>
              Informações do Cliente
            </h3>
            <div className="form-grid-edit">
              <div className="form-group-edit">
                <label>CNPJ</label>
                <input type="text" name="CNPJ" value={formData.CNPJ} onChange={handleChange} disabled className="input-disabled"/>
              </div>
              <div className="form-group-edit full-width">
                <label>Nome do Cliente</label>
                <input type="text" name="CLIENTE" value={formData.CLIENTE} onChange={handleChange} required/>
              </div>
            </div>
          </div>

          {/* Produtos por Indústria */}
          <div className="section-edit">
            <h3 className="section-title-edit">
              <span className="section-icon">🏭</span>
              Produtos e Valores
            </h3>

            {formData.industries && Object.entries(formData.industries).map(([industryName, products]) => (
              <div key={industryName} className="industry-card-edit">
                <div className="industry-header-edit">
                  <div className="industry-info-edit">
                    <h4>{industryName}</h4>
                    <span className="product-count">
                      {progressByIndustry[industryName]?.positivated || 0} de {progressByIndustry[industryName]?.total || 0} produtos
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn-select-all"
                    onClick={() => handleSelectAll(industryName)}
                  >
                    {selectAll[industryName] ? '✓ Desmarcar Todos' : '☐ Marcar Todos'}
                  </button>
                </div>

                <div className="progress-bar-edit">
                  <div
                    className="progress-fill-edit"
                    style={{ width: `${progressByIndustry[industryName]?.percentage || 0}%` }}
                  />
                </div>
                <p className="progress-text-edit">
                  {Math.round(progressByIndustry[industryName]?.percentage || 0)}% concluído
                </p>

                <div className="products-grid-edit">
                  {products && Object.entries(products).map(([productName, productData]) => (
                    <div
                      key={productName}
                      className={`product-card-edit ${productData.positivado ? 'positivated' : ''}`}
                    >
                      <div className="product-header-edit">
                        <label className="checkbox-label-edit">
                          <input
                            type="checkbox"
                            checked={productData.positivado || false}
                            onChange={(e) =>
                              handleProductChange(industryName, productName, 'positivado', e.target.checked)
                            }
                            className="checkbox-custom"
                          />
                          <span className="checkbox-custom-design"></span>
                          <span className="product-name-edit">{productName}</span>
                        </label>
                        {productData.positivado && (
                          <span className="check-badge">✓</span>
                        )}
                      </div>

                      {productData.positivado && (
                        <div className="product-value-input">
                          <label>Valor</label>
                          <div className="input-currency">
                            <span className="currency-symbol">R$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={productData.valor || 0}
                              onChange={(e) =>
                                handleProductChange(industryName, productName, 'valor', e.target.value)
                              }
                              placeholder="0,00"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="industry-total-edit">
                  <span>Total {industryName}:</span>
                  <span className="total-value-edit">
                    {formatCurrency(progressByIndustry[industryName]?.value || 0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          
          {/* Observações (agora escondidas, mas mantidas para dados) */}
          <div className="section-edit" style={{ display: 'none' }}>
            <h3 className="section-title-edit"><span className="section-icon">📝</span>Observações</h3>
            <textarea name="notes" value={formData.notes} onChange={handleChange} rows="4" className="textarea-edit"/>
          </div>

          {/* Total Geral */}
          <div className="total-section-edit">
            <div className="total-content-edit">
              <span className="total-label-edit">VALOR TOTAL</span>
              <span className="total-amount-edit">{formatCurrency(totalValue)}</span>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="modal-footer-edit">
            <button type="button" className="btn-cancel-edit" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-save-edit">
              <span>💾</span>
              Salvar Alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditClientModal;