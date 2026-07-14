// SUBSTITUA: src/components/CreateCampaignModal.js
// ADICIONADA LÓGICA PARA EDITAR INDÚSTRIA EXISTENTE

import React, { useState, useEffect } from 'react';
import { Trash2, X, Table2 } from 'lucide-react';
import { toast } from 'sonner';
import ConfirmDialog from './ConfirmDialog';
import TabelaPickerModal from './TabelaPickerModal';
import './CreateCampaignModal.css';

const CreateCampaignModal = ({ onClose, onSave, campaign = null }) => {
  const INDUSTRY_META_FIELDS = ['targetValue', 'alreadySoldValue'];
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
    alreadySoldValue: 0,
    products: []
  });
  
  // NOVO ESTADO: Guarda a indústria que estamos a editar
  const [editingIndustry, setEditingIndustry] = useState(null); 

  const [currentProduct, setCurrentProduct] = useState('');
  const [errors, setErrors] = useState({});
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', description: '', onConfirm: null });
  const [showTablePicker, setShowTablePicker] = useState(false);

  // Produto pode vir como string (campanhas antigas) ou objeto {nome, ean}.
  // normalizeProduct garante sempre {nome, ean, preco, qtd_caixa}.
  const normalizeProduct = (p) =>
    typeof p === 'string'
      ? { nome: p, ean: '', preco: null, qtd_caixa: null }
      : { nome: p?.nome || '', ean: p?.ean || '', preco: p?.preco ?? null, qtd_caixa: p?.qtd_caixa ?? null };

  const showConfirm = (title, description, onConfirm) =>
    setConfirmDialog({ open: true, title, description, onConfirm });
  const closeConfirm = () => setConfirmDialog(d => ({ ...d, open: false }));

  // ============================================
  // CARREGAR DADOS DA CAMPANHA (SE FOR EDIÇÃO)
  // ============================================
  useEffect(() => {
    if (campaign) {
      const industriesArray = campaign.industries 
        ? Object.keys(campaign.industries).map(industryName => {
            const industryData = campaign.industries[industryName];
            const targetValue = industryData.targetValue || 0;
            const alreadySoldValue = industryData.alreadySoldValue || 0;
            const products = Object.keys(industryData)
              .filter(key => !INDUSTRY_META_FIELDS.includes(key))
              .map(nome => ({
                nome,
                ean: industryData[nome]?.ean || '',
                preco: industryData[nome]?.preco ?? null,
                qtd_caixa: industryData[nome]?.qtd_caixa ?? null,
              }));
            return {
              id: Date.now() + Math.random(), // ID local para o array
              name: industryName,
              targetValue: targetValue,
              alreadySoldValue: alreadySoldValue,
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

  const handleAlreadySoldValueChange = (e) => {
    let value = e.target.value.replace(/[^\d,]/g, '');
    const parts = value.split(',');
    if (parts.length > 2) value = parts[0] + ',' + parts.slice(1).join('');
    const numValue = value.replace(',', '.');
    setCurrentIndustry(prev => ({ ...prev, alreadySoldValue: parseFloat(numValue) || 0 }));
  };

  const handleAddProduct = () => {
    const nome = currentProduct.trim();
    if (!nome) return;
    if (currentIndustry.products.some(p => normalizeProduct(p).nome === nome)) {
      toast.warning('⚠️ Este produto já foi adicionado');
      return;
    }
    setCurrentIndustry(prev => ({
      ...prev,
      products: [...prev.products, { nome, ean: '', preco: null, qtd_caixa: null }]
    }));
    setCurrentProduct('');
  };

  const handleRemoveProduct = (nome) => {
    setCurrentIndustry(prev => ({
      ...prev,
      products: prev.products.filter(p => normalizeProduct(p).nome !== nome)
    }));
  };

  // Recebe os itens marcados no TabelaPickerModal ({nome, ean, preco, qtd_caixa})
  // e adiciona à indústria atual, ignorando duplicados (por EAN, senão por nome).
  const handleAddFromTable = (escolhidos) => {
    setCurrentIndustry(prev => {
      const existentes = prev.products.map(normalizeProduct);
      const jaTem = (item) =>
        existentes.some(p =>
          (item.ean && p.ean && p.ean === item.ean) || p.nome === item.nome
        );
      const novos = [];
      let ignorados = 0;
      escolhidos.forEach(it => {
        const item = normalizeProduct(it);
        if (!item.nome) return;
        if (jaTem(item) || novos.some(n => n.nome === item.nome)) { ignorados += 1; return; }
        novos.push(item);
      });
      if (novos.length) {
        toast.success(`✅ ${novos.length} produto${novos.length > 1 ? 's' : ''} da tabela adicionado${novos.length > 1 ? 's' : ''}`);
      }
      if (ignorados) {
        toast.info(`${ignorados} já estava${ignorados > 1 ? 'm' : ''} na lista`);
      }
      return { ...prev, products: [...prev.products, ...novos] };
    });
    setShowTablePicker(false);
  };

  // FUNÇÃO ATUALIZADA (AGORA FAZ ADD OU UPDATE)
  const handleSaveIndustry = () => {
    if (!currentIndustry.name.trim()) { toast.warning('⚠️ Digite o nome da indústria'); return; }
    if (currentIndustry.products.length === 0) { toast.warning('⚠️ Adicione pelo menos um produto'); return; }
    if (currentIndustry.targetValue <= 0) { toast.warning('⚠️ Digite um valor de meta válido'); return; }

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
    setCurrentIndustry({ name: '', targetValue: 0, alreadySoldValue: 0, products: [] });
    setCurrentProduct('');
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleIndustryEditOverlayClick = (e) => {
    if (e.target === e.currentTarget) handleCancelEdit();
  };

  const handleRemoveIndustry = (industryId) => {
    const industry = formData.industries.find(ind => ind.id === industryId);
    showConfirm(
      'Remover indústria',
      `Remover "${industry?.name || 'esta indústria'}" da campanha? Depois clique em Salvar Alterações para gravar.`,
      () => {
        setFormData(prev => ({
          ...prev,
          industries: prev.industries.filter(ind => ind.id !== industryId)
        }));
        if (editingIndustry?.id === industryId) handleCancelEdit();
      }
    );
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

  // Monta o objeto de campanha (industries no formato do Firestore) a partir
  // do formulário. Usado tanto no salvar quanto no publicar-compartilhada.
  const buildCampaignData = () => {
    const industriesObj = {};
    formData.industries.forEach(industry => {
      industriesObj[industry.name] = {
        targetValue: industry.targetValue,
        alreadySoldValue: industry.alreadySoldValue || 0
      };
      industry.products.forEach(prod => {
        const product = normalizeProduct(prod);
        if (!product.nome) return;
        const existingProduct = campaign?.industries?.[industry.name]?.[product.nome];
        // Preserva positivado/valor de quem já existia; sempre garante o EAN
        // (para positivação automática por código de barras no futuro).
        industriesObj[industry.name][product.nome] = {
          positivado: existingProduct?.positivado ?? false,
          valor: existingProduct?.valor ?? 0,
          ean: product.ean || existingProduct?.ean || '',
          ...(product.preco != null ? { preco: product.preco } : {}),
          ...(product.qtd_caixa != null ? { qtd_caixa: product.qtd_caixa } : {}),
        };
      });
    });

    return {
      name: formData.name.trim(),
      startDate: formData.startDate,
      endDate: formData.endDate,
      status: formData.status,
      industries: industriesObj
    };
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    onSave(buildCampaignData());
  };
  
  const formatTargetValueInput = () => {
    if (currentIndustry.targetValue === 0) return '';
    return currentIndustry.targetValue.toString().replace('.', ',');
  };

  const formatAlreadySoldValueInput = () => {
    if (currentIndustry.alreadySoldValue === 0) return '';
    return currentIndustry.alreadySoldValue.toString().replace('.', ',');
  };

  const formatCurrency = (value) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

  const getIndustryProgress = (industry) => {
    if (!industry.targetValue) return 0;
    return Math.min(((industry.alreadySoldValue || 0) / industry.targetValue) * 100, 100);
  };

  // ============================================
  // RENDER (JSX ATUALIZADO COM BOTÕES DE EDITAR)
  // ============================================
  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content-campaign" onClick={(e) => e.stopPropagation()}>
        
        <div className="campaign-modal-header">
          <h2>{campaign ? '✏️ Editar Campanha' : '➕ Nova Campanha'}</h2>
          <button type="button" className="btn-close-campaign" onClick={onClose} aria-label="Fechar">
            <X size={20} strokeWidth={2.4} />
          </button>
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
                <div className="industries-list-header">
                  <div>
                    <h3>Indústrias da campanha</h3>
                    <p>Confira metas, avanço e produtos antes de salvar.</p>
                  </div>
                  <span>{formData.industries.length} indústria{formData.industries.length > 1 ? 's' : ''}</span>
                </div>
                <div className="industries-card-grid">
                  {formData.industries.map(industry => {
                    const remainingValue = Math.max((industry.targetValue || 0) - (industry.alreadySoldValue || 0), 0);
                    const progress = getIndustryProgress(industry);

                    return (
                      <div key={industry.id} className="industry-item">
                        <div className="industry-header">
                          <div className="industry-header-info">
                            <span className="industry-label">Indústria</span>
                            <strong>{industry.name}</strong>
                            <small>{industry.products.length} produto{industry.products.length !== 1 ? 's' : ''} acompanhado{industry.products.length !== 1 ? 's' : ''}</small>
                          </div>
                          <div className="industry-header-actions">
                            <button
                              type="button"
                              className="btn-edit-industry"
                              onClick={() => handleSelectIndustryToEdit(industry)}
                              title="Editar indústria"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn-remove-industry"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveIndustry(industry.id);
                              }}
                              title="Remover indústria"
                              aria-label={`Remover indústria ${industry.name}`}
                            >
                              <Trash2 size={15} strokeWidth={2.4} />
                            </button>
                          </div>
                        </div>

                        <div className="industry-metrics">
                          <div>
                            <span>Meta</span>
                            <strong>{formatCurrency(industry.targetValue)}</strong>
                          </div>
                          <div>
                            <span>Vendido campanha</span>
                            <strong>{formatCurrency(industry.alreadySoldValue)}</strong>
                          </div>
                          <div className="remaining">
                            <span>Falta</span>
                            <strong>{formatCurrency(remainingValue)}</strong>
                          </div>
                        </div>

                        <div className="industry-progress">
                          <div>
                            <span>Avanço da meta</span>
                            <strong>{Math.round(progress)}%</strong>
                          </div>
                          <div className="industry-progress-track">
                            <span style={{ width: `${progress}%` }} />
                          </div>
                        </div>

                        <div className="industry-products">
                          <strong>Produtos</strong>
                          <div className="industry-product-list">
                            {industry.products.slice(0, 6).map(product => (
                              <span key={product}>{product}</span>
                            ))}
                            {industry.products.length > 6 && (
                              <span className="more-products">+{industry.products.length - 6}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {errors.industries && <span className="error-message">{errors.industries}</span>}

            {/* Adicionar Indústria (Formulário dinâmico) */}
            <div className="add-industry-section">
              <h3>➕ Adicionar Nova Indústria</h3>
              
              <div className="campaign-form-group">
                <label>Nome da Indústria</label>
                <input type="text" name="name" value={currentIndustry.name} onChange={handleIndustryChange} placeholder="Ex: Ambev"/>
              </div>
              <div className="campaign-form-group">
                <label>Meta de Valor (R$)</label>
                <input type="text" placeholder="0,00" value={formatTargetValueInput()} onChange={handleTargetValueChange} />
              </div>
              <div className="campaign-form-group">
                <label>Vendido nesta campanha (R$)</label>
                <input type="text" placeholder="0,00" value={formatAlreadySoldValueInput()} onChange={handleAlreadySoldValueChange} />
              </div>
              <div className="campaign-form-group">
                <label>Produtos</label>
                <div className="input-with-button">
                  <input type="text" value={currentProduct} onChange={(e) => setCurrentProduct(e.target.value)} placeholder="Ex: Skol" onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddProduct())}/>
                  <button type="button" className="btn-add-product" onClick={handleAddProduct}>➕ Adicionar</button>
                </div>
                <button type="button" className="btn-pull-table" onClick={() => setShowTablePicker(true)}>
                  <Table2 size={15} strokeWidth={2.4} /> Puxar da tabela da empresa
                </button>
                {currentIndustry.products.length > 0 && (
                  <div className="products-tags">
                    {currentIndustry.products.map((product, idx) => {
                      const p = normalizeProduct(product);
                      return (
                        <span key={p.ean || p.nome || idx} className="product-tag" title={p.ean ? `EAN ${p.ean}` : 'Sem EAN'}>
                          {p.nome}
                          <button type="button" onClick={() => handleRemoveProduct(p.nome)}>×</button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Botão de Salvar/Adicionar dinâmico */}
              <button
                type="button"
                className="btn-add-industry"
                onClick={handleSaveIndustry}
              >
                ➕ Adicionar Indústria
              </button>
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

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={() => { confirmDialog.onConfirm?.(); closeConfirm(); }}
        onCancel={closeConfirm}
      />

      {showTablePicker && (
        <TabelaPickerModal
          onClose={() => setShowTablePicker(false)}
          onAdd={handleAddFromTable}
          ctaLabel="à campanha"
        />
      )}


      {editingIndustry && (
        <div className="industry-edit-overlay" onClick={handleIndustryEditOverlayClick}>
          <div className="industry-edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="industry-edit-header">
              <div>
                <h3>Editar indústria</h3>
                <p>Atualize metas e produtos desta indústria.</p>
              </div>
              <button type="button" onClick={handleCancelEdit} aria-label="Fechar edição de indústria">
                <X size={19} strokeWidth={2.4} />
              </button>
            </div>

            <div className="industry-edit-body">
              <div className="campaign-form-group">
                <label>Nome da Indústria</label>
                <input type="text" name="name" value={currentIndustry.name} onChange={handleIndustryChange} placeholder="Ex: Ambev"/>
              </div>
              <div className="campaign-form-group">
                <label>Meta de Valor (R$)</label>
                <input type="text" placeholder="0,00" value={formatTargetValueInput()} onChange={handleTargetValueChange} />
              </div>
              <div className="campaign-form-group">
                <label>Vendido nesta campanha (R$)</label>
                <input type="text" placeholder="0,00" value={formatAlreadySoldValueInput()} onChange={handleAlreadySoldValueChange} />
              </div>
              <div className="campaign-form-group">
                <label>Produtos</label>
                <div className="input-with-button">
                  <input type="text" value={currentProduct} onChange={(e) => setCurrentProduct(e.target.value)} placeholder="Ex: Skol" onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddProduct())}/>
                  <button type="button" className="btn-add-product" onClick={handleAddProduct}>Adicionar</button>
                </div>
                <button type="button" className="btn-pull-table" onClick={() => setShowTablePicker(true)}>
                  <Table2 size={15} strokeWidth={2.4} /> Puxar da tabela da empresa
                </button>
                {currentIndustry.products.length > 0 && (
                  <div className="products-tags">
                    {currentIndustry.products.map((product, idx) => {
                      const p = normalizeProduct(product);
                      return (
                        <span key={p.ean || p.nome || idx} className="product-tag" title={p.ean ? `EAN ${p.ean}` : 'Sem EAN'}>
                          {p.nome}
                          <button type="button" onClick={() => handleRemoveProduct(p.nome)}>×</button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="industry-edit-footer">
              <button type="button" className="btn-cancel-campaign" onClick={handleCancelEdit}>
                Cancelar
              </button>
              <button type="button" className="btn-save-campaign" onClick={handleSaveIndustry}>
                Salvar indústria
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateCampaignModal;
