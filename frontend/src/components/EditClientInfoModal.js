// SUBSTITUA: src/components/EditClientModal.js
// CORRIGIDO: Tag </Sspan> trocada para </p>

import React, { useState, useEffect } from 'react';
import './EditClientModal.css'; 

const EditClientModal = ({ isOpen, onClose, client, onSave, campaign }) => {
  const [formData, setFormData] = useState({
    CNPJ: '', CLIENTE: '', industries: {}, notes: ''
  });

  const [selectAll, setSelectAll] = useState({});
  const [totalValue, setTotalValue] = useState(0);
  const [progressByIndustry, setProgressByIndustry] = useState({});

  // Hook de Carregamento
  useEffect(() => {
    if (client && campaign && isOpen) {
      const hydratedIndustries = {};
      if (campaign.industries) {
        Object.entries(campaign.industries).forEach(([industryName, products]) => {
          hydratedIndustries[industryName] = {};
          Object.keys(products).filter(p => p !== 'targetValue').forEach(productName => {
            const clientProductData = client.industries?.[industryName]?.[productName];
            const valorNum = clientProductData?.valor;
            const valorString = (valorNum === 0 || !valorNum) 
              ? '' 
              : String(valorNum).replace('.', ',');
            hydratedIndustries[industryName][productName] = {
              valor: valorString,
              positivado: clientProductData?.positivado || false,
            };
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

  // Hook de Cálculo
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
            const value = parseFloat(String(productData.valor).replace(',', '.')) || 0;
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

  // Handler de Inputs
  const handleProductChange = (industryName, productName, field, value) => {
    setFormData(prev => {
        const newFormData = { ...prev };
        const product = newFormData.industries[industryName][productName];

        if (field === 'positivado') {
            product.positivado = value;
            if (value === false) product.valor = '';
        } 
        
        if (field === 'valor') {
            let newValue = value.replace(/[^\d,]/g, ''); 
            const parts = newValue.split(',');
            if (parts.length > 2) newValue = parts[0] + ',' + parts.slice(1).join('');
            if (parts[1] && parts[1].length > 2) newValue = parts[0] + ',' + parts[1].substring(0, 2);
            if (newValue.length > 1 && newValue.startsWith('0') && !newValue.startsWith('0,')) newValue = newValue.substring(1);
            if (newValue.startsWith(',')) newValue = '0' + newValue;
            product.valor = newValue;
        }
        return newFormData;
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
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
          valor: newValue ? updatedIndustry[productName].valor : ''
        };
      });
      return { ...prev, industries: { ...prev.industries, [industryName]: updatedIndustry } };
    });
  };

  // Handler de Submissão
  const handleSubmit = (e) => {
    e.preventDefault();
    const dataToSave = JSON.parse(JSON.stringify(formData));
    if (dataToSave.industries) {
      Object.keys(dataToSave.industries).forEach(industryName => {
        Object.keys(dataToSave.industries[industryName]).forEach(productName => {
          const product = dataToSave.industries[industryName][productName];
          product.valor = parseFloat(String(product.valor).replace(',', '.')) || 0;
        });
      });
    }
    onSave({ ...client, ...dataToSave }); 
    onClose();
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="edit-client-modal" onClick={(e) => e.stopPropagation()}>
        
        <div className="modal-header-edit">
          <div className="modal-header-content">
            <h2>🏭 Positivar Produtos</h2>
            <p>Marque os produtos positivados e insira os valores</p>
          </div>
          <button className="btn-close-edit" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body-edit">
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
                  <button type="button" className="btn-select-all" onClick={() => handleSelectAll(industryName)}>
                    {selectAll[industryName] ? '✓ Desmarcar Todos' : '☐ Marcar Todos'}
                  </button>
                </div>
                <div className="progress-bar-edit">
                  <div
                    className="progress-fill-edit"
                    style={{ width: `${progressByIndustry[industryName]?.percentage || 0}%` }}
                  />
                </div>
                
                {/* ⭐️ CORREÇÃO AQUI ⭐️ */}
                <p className="progress-text-edit">
                  {Math.round(progressByIndustry[industryName]?.percentage || 0)}% concluído
                </p>
                {/* ⭐️ </Sspan> foi corrigido para </p> ⭐️ */}

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
                        {productData.positivado && ( <span className="check-badge">✓</span> )}
                      </div>
                      {productData.positivado && (
                        <div className="product-value-input">
                          <label>Valor</label>
                          <div className="input-currency">
                            <span className="currency-symbol">R$</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={productData.valor}
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