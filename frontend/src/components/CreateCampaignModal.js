// SUBSTITUA: src/components/CreateCampaignModal.js
// ADICIONADA LÓGICA PARA EDITAR INDÚSTRIA EXISTENTE

import React, { useState, useEffect } from 'react';
import './CreateCampaignModal.css'; 

const CreateCampaignModal = ({ onClose, onSave, campaign = null }) => {
  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
    status: 'active',
    industries: [] 
  });

  const [currentIndustry, setCurrentIndustry] = useState({
    name: '',
    targetValue: 0,
    products: []
  });
  
  // NOVO ESTADO: Guarda a indústria que estamos a editar
  const [editingIndustry, setEditingIndustry] = useState(null); 

  const [currentProduct, setCurrentProduct] = useState('');
  const [errors, setErrors] = useState({});

  // ============================================
  // CARREGAR DADOS DA CAMPANHA (SE FOR EDIÇÃO)
  // ============================================
  useEffect(() => {
    if (campaign) {
      const industriesArray = campaign.industries 
        ? Object.keys(campaign.industries).map(industryName => {
            const industryData = campaign.industries[industryName];
            const targetValue = industryData.targetValue || 0;
            const products = Object.keys(industryData).filter(key => key !== 'targetValue');
            return {
              id: Date.now() + Math.random(), // ID local para o array
              name: industryName,
              targetValue: targetValue,
              products: products
            };
          })
        : [];
      setFormData({
        name: campaign.name || '',
        startDate: campaign.startDate || '',
        endDate: campaign.endDate || '',
        status: campaign.status || 'active',
        industries: industriesArray
      });
    }
  }, [campaign]);

  // ============================================
  // HANDLERS
  // ============================================
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleIndustryChange = (e) => {
    const { name, value } = e.target;
    setCurrentIndustry(prev => ({ ...prev, [name]: value }));
  };

  const handleTargetValueChange = (e) => {
    let value = e.target.value.replace(/[^\d,]/g, '');
    const parts = value.split(',');
    if (parts.length > 2) value = parts[0] + ',' + parts.slice(1).join('');
    const numValue = value.replace(',', '.');
    setCurrentIndustry(prev => ({ ...prev, targetValue: parseFloat(numValue) || 0 }));
  };

  const handleAddProduct = () => {
    if (!currentProduct.trim()) return;
    if (currentIndustry.products.includes(currentProduct.trim())) {
      alert('⚠️ Este produto já foi adicionado');
      return;
    }
    setCurrentIndustry(prev => ({
      ...prev,
      products: [...prev.products, currentProduct.trim()]
    }));
    setCurrentProduct('');
  };

  const handleRemoveProduct = (product) => {
    setCurrentIndustry(prev => ({
      ...prev,
      products: prev.products.filter(p => p !== product)
    }));
  };

  // FUNÇÃO ATUALIZADA (AGORA FAZ ADD OU UPDATE)
  const handleSaveIndustry = () => {
    if (!currentIndustry.name.trim()) { alert('⚠️ Digite o nome da indústria'); return; }
    if (currentIndustry.products.length === 0) { alert('⚠️ Adicione pelo menos um produto'); return; }
    if (currentIndustry.targetValue <= 0) { alert('⚠️ Digite um valor de meta válido'); return; }

    if (editingIndustry) {
      // MODO UPDATE
      setFormData(prev => ({
        ...prev,
        industries: prev.industries.map(ind => 
          ind.id === editingIndustry.id ? { ...currentIndustry, id: ind.id, name: currentIndustry.name.trim() } : ind
        )
      }));
    } else {
      // MODO ADICIONAR
      const newIndustry = {
        ...currentIndustry,
        id: Date.now(),
        name: currentIndustry.name.trim(),
      };
      setFormData(prev => ({ ...prev, industries: [...prev.industries, newIndustry] }));
    }
    handleCancelEdit(); // Limpa o formulário
  };
  
  // NOVA FUNÇÃO: Carrega a indústria no formulário para edição
  const handleSelectIndustryToEdit = (industry) => {
    setEditingIndustry(industry);
    setCurrentIndustry(industry);
  };
  
  // NOVA FUNÇÃO: Limpa o formulário e o modo de edição
  const handleCancelEdit = () => {
    setEditingIndustry(null);
    setCurrentIndustry({ name: '', targetValue: 0, products: [] });
    setCurrentProduct('');
  };

  const handleRemoveIndustry = (industryId) => {
    if (window.confirm('Tem certeza que deseja remover esta indústria?')) {
      setFormData(prev => ({
        ...prev,
        industries: prev.industries.filter(ind => ind.id !== industryId)
      }));
    }
  };

  // ============================================
  // VALIDAÇÃO E SUBMIT
  // ============================================
  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Nome da campanha é obrigatório';
    if (!formData.startDate) newErrors.startDate = 'Data de início é obrigatória';
    if (!formData.endDate) newErrors.endDate = 'Data de término é obrigatória';
    if (formData.startDate && formData.endDate && new Date(formData.startDate) > new Date(formData.endDate)) {
      newErrors.endDate = 'Data de término deve ser após data de início';
    }
    if (formData.industries.length === 0) {
      newErrors.industries = 'Adicione pelo menos uma indústria';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingIndustry) {
      alert('⚠️ Termine de editar a indústria antes de salvar a campanha.');
      return;
    }
    if (!validate()) return;

    const industriesObj = {};
    formData.industries.forEach(industry => {
      industriesObj[industry.name] = {
        targetValue: industry.targetValue
      };
      industry.products.forEach(product => {
        const existingProduct = campaign?.industries?.[industry.name]?.[product];
        if (existingProduct) {
          industriesObj[industry.name][product] = existingProduct;
        } else {
          industriesObj[industry.name][product] = { positivado: false, valor: 0 };
        }
      });
    });

    const campaignData = {
      name: formData.name.trim(),
      startDate: formData.startDate,
      endDate: formData.endDate,
      status: formData.status,
      industries: industriesObj
    };
    onSave(campaignData);
  };
  
  const formatTargetValueInput = () => {
    if (currentIndustry.targetValue === 0) return '';
    return currentIndustry.targetValue.toString().replace('.', ',');
  };

  // ============================================
  // RENDER (JSX ATUALIZADO COM BOTÕES DE EDITAR)
  // ============================================
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content-campaign" onClick={(e) => e.stopPropagation()}>
        
        <div className="campaign-modal-header">
          <h2>{campaign ? '✏️ Editar Campanha' : '➕ Nova Campanha'}</h2>
          <button className="btn-close-campaign" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
          <div className="campaign-modal-body">
            {/* Nome, Datas, Status */}
            <div className="campaign-form-group">
              <label>Nome da Campanha *</label>
              <input type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="Ex: Spani 4º Trimestre" className={errors.name ? 'error' : ''}/>
              {errors.name && <span className="error-message">{errors.name}</span>}
            </div>
            <div className="campaign-dates-row">
              <div className="campaign-form-group">
                <label>Data de Início *</label>
                <input type="date" name="startDate" value={formData.startDate} onChange={handleInputChange} className={errors.startDate ? 'error' : ''}/>
                {errors.startDate && <span className="error-message">{errors.startDate}</span>}
              </div>
              <div className="campaign-form-group">
                <label>Data de Término *</label>
                <input type="date" name="endDate" value={formData.endDate} onChange={handleInputChange} className={errors.endDate ? 'error' : ''}/>
                {errors.endDate && <span className="error-message">{errors.endDate}</span>}
              </div>
            </div>
            <div className="campaign-form-group">
              <label>Status</label>
              <select name="status" value={formData.status} onChange={handleInputChange}>
                <option value="active">Ativa</option>
                <option value="inactive">Inativa</option>
              </select>
            </div>

            {/* Indústrias Adicionadas (COM BOTÃO DE EDITAR) */}
            {formData.industries.length > 0 && (
              <div className="industries-list">
                <h3>Indústrias Adicionadas</h3>
                {formData.industries.map(industry => (
                  <div key={industry.id} className="industry-item">
                    <div className="industry-header">
                      <div className="industry-header-info">
                        <strong>{industry.name}</strong>
                        <span className="industry-target">
                          Meta: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(industry.targetValue)}
                        </span>
                      </div>
                      <div className="industry-header-actions">
                        {/* ⭐️ NOVO BOTÃO DE EDITAR ⭐️ */}
                        <button
                          type="button"
                          className="btn-edit-industry"
                          onClick={() => handleSelectIndustryToEdit(industry)}
                          title="Editar Indústria"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="btn-remove"
                          onClick={() => handleRemoveIndustry(industry.id)}
                          title="Remover Indústria"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    <div className="industry-products">
                      <strong>Produtos:</strong> {industry.products.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {errors.industries && <span className="error-message">{errors.industries}</span>}

            {/* Adicionar Indústria (Formulário dinâmico) */}
            <div className="add-industry-section">
              <h3>{editingIndustry ? '✏️ Atualizar Indústria' : '➕ Adicionar Nova Indústria'}</h3>
              
              <div className="campaign-form-group">
                <label>Nome da Indústria</label>
                <input type="text" name="name" value={currentIndustry.name} onChange={handleIndustryChange} placeholder="Ex: Ambev"/>
              </div>
              <div className="campaign-form-group">
                <label>Meta de Valor (R$)</label>
                <input type="text" placeholder="0,00" value={formatTargetValueInput()} onChange={handleTargetValueChange} />
              </div>
              <div className="campaign-form-group">
                <label>Produtos</label>
                <div className="input-with-button">
                  <input type="text" value={currentProduct} onChange={(e) => setCurrentProduct(e.target.value)} placeholder="Ex: Skol" onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddProduct())}/>
                  <button type="button" className="btn-add-product" onClick={handleAddProduct}>➕ Adicionar</button>
                </div>
                {currentIndustry.products.length > 0 && (
                  <div className="products-tags">
                    {currentIndustry.products.map((product, idx) => (
                      <span key={idx} className="product-tag">
                        {product}
                        <button type="button" onClick={() => handleRemoveProduct(product)}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Botão de Salvar/Adicionar dinâmico */}
              <button
                type="button"
                className="btn-add-industry"
                onClick={handleSaveIndustry}
              >
                {editingIndustry ? '💾 Atualizar Indústria' : '➕ Adicionar Indústria'}
              </button>
              
              {/* Botão de Cancelar Edição */}
              {editingIndustry && (
                <button
                  type="button"
                  className="btn-cancel-edit-industry"
                  onClick={handleCancelEdit}
                >
                  Cancelar Edição
                </button>
              )}
            </div>
          </div>

          <div className="campaign-modal-footer">
            <button type="button" className="btn-cancel-campaign" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-save-campaign">
              {campaign ? '💾 Salvar Alterações' : '💾 Criar Campanha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateCampaignModal;