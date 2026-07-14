import React, { useState, useEffect } from 'react';
import { Trash2, X, Table2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import ConfirmDialog from './ConfirmDialog';
import TabelaPickerModal from './TabelaPickerModal';
import { campaignsService } from '../services/campaigns.service';
import './CreateCampaignModal.css';

// Campanha MESTRE (admin): estrutura padrão que os RCAs enxergam.
// NÃO tem meta — as metas são cadastradas por cada RCA na conta dele.
export default function MasterCampaignModal({ onClose, onSaved, mestre = null }) {
  const [formData, setFormData] = useState({
    nome: '', distribuidora: '', startDate: '', endDate: '',
    descricao: '', regulamento: '', objetivosGerais: '',
    categorias: '', active: true, industries: [],
  });
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const [currentIndustry, setCurrentIndustry] = useState({ name: '', products: [] });
  const [editingIndustryId, setEditingIndustryId] = useState(null);
  const [prod, setProd] = useState({ nome: '', codigo: '', ean: '' });
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, onConfirm: null, title: '', description: '' });

  const isEdit = !!mestre;

  useEffect(() => {
    if (!mestre) return;
    const industriesArray = Object.keys(mestre.industries || {}).map((name, i) => {
      const produtos = mestre.industries[name]?.produtos || {};
      return {
        id: Date.now() + i,
        name,
        products: Object.keys(produtos).map(k => ({
          nome: produtos[k]?.nome || k,
          codigo: produtos[k]?.codigo || '',
          ean: produtos[k]?.ean || '',
        })),
      };
    });
    setFormData({
      nome: mestre.nome || '',
      distribuidora: mestre.distribuidora || '',
      startDate: mestre.startDate || '',
      endDate: mestre.endDate || '',
      descricao: mestre.descricao || '',
      regulamento: mestre.regulamento || '',
      objetivosGerais: mestre.objetivosGerais || '',
      categorias: (mestre.categorias || []).join(', '),
      active: mestre.active !== false,
      industries: industriesArray,
    });
  }, [mestre]);

  const setField = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(e => ({ ...e, [name]: '' }));
  };

  // ---- Produtos da indústria em edição ----
  const addProduct = () => {
    const nome = prod.nome.trim();
    if (!nome) return;
    if (currentIndustry.products.some(p => p.nome === nome)) {
      toast.warning('⚠️ Produto já adicionado'); return;
    }
    setCurrentIndustry(prev => ({
      ...prev,
      products: [...prev.products, { nome, codigo: prod.codigo.trim(), ean: prod.ean.trim() }],
    }));
    setProd({ nome: '', codigo: '', ean: '' });
  };

  const removeProduct = (nome) => setCurrentIndustry(prev => ({
    ...prev, products: prev.products.filter(p => p.nome !== nome),
  }));

  const addFromTable = (escolhidos) => {
    setCurrentIndustry(prev => {
      const existe = (item) => prev.products.some(p =>
        (item.ean && p.ean && p.ean === item.ean) || p.nome === item.nome);
      const novos = [];
      let ign = 0;
      escolhidos.forEach(it => {
        const item = { nome: (it.nome || '').trim(), codigo: '', ean: it.ean || '' };
        if (!item.nome) return;
        if (existe(item) || novos.some(n => n.nome === item.nome)) { ign += 1; return; }
        novos.push(item);
      });
      if (novos.length) toast.success(`✅ ${novos.length} produto(s) da tabela adicionado(s)`);
      if (ign) toast.info(`${ign} já estava(m) na lista`);
      return { ...prev, products: [...prev.products, ...novos] };
    });
    setShowTablePicker(false);
  };

  // ---- Indústrias ----
  const saveIndustry = () => {
    if (!currentIndustry.name.trim()) { toast.warning('⚠️ Nome da indústria'); return; }
    if (currentIndustry.products.length === 0) { toast.warning('⚠️ Adicione ao menos 1 produto'); return; }
    if (editingIndustryId) {
      setFormData(prev => ({
        ...prev,
        industries: prev.industries.map(ind =>
          ind.id === editingIndustryId ? { ...currentIndustry, id: ind.id, name: currentIndustry.name.trim() } : ind),
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        industries: [...prev.industries, { ...currentIndustry, id: Date.now(), name: currentIndustry.name.trim() }],
      }));
    }
    cancelIndustryEdit();
  };

  const editIndustry = (ind) => { setEditingIndustryId(ind.id); setCurrentIndustry({ name: ind.name, products: ind.products }); };
  const cancelIndustryEdit = () => { setEditingIndustryId(null); setCurrentIndustry({ name: '', products: [] }); setProd({ nome: '', codigo: '', ean: '' }); };

  const removeIndustry = (id) => {
    const ind = formData.industries.find(i => i.id === id);
    setConfirmDialog({
      open: true, title: 'Remover indústria',
      description: `Remover "${ind?.name}" da campanha mestre?`,
      onConfirm: () => {
        setFormData(prev => ({ ...prev, industries: prev.industries.filter(i => i.id !== id) }));
        if (editingIndustryId === id) cancelIndustryEdit();
      },
    });
  };

  // ---- Salvar ----
  const validate = () => {
    const e = {};
    if (!formData.nome.trim()) e.nome = 'Nome é obrigatório';
    if (!isEdit && code.trim().length < 4) e.code = 'Senha de ao menos 4 caracteres';
    if (code.trim() && code.trim().length < 4) e.code = 'Senha de ao menos 4 caracteres';
    if (formData.industries.length === 0) e.industries = 'Adicione ao menos uma indústria';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildIndustries = () => {
    const obj = {};
    formData.industries.forEach(ind => {
      const produtos = {};
      ind.products.forEach(p => {
        const nome = (p.nome || '').trim();
        if (!nome) return;
        produtos[nome] = { codigo: (p.codigo || '').trim(), nome, ean: (p.ean || '').trim() };
      });
      obj[ind.name] = { produtos };
    });
    return obj;
  };

  const handleSave = async () => {
    if (!validate()) return;
    const payload = {
      nome: formData.nome.trim(),
      distribuidora: formData.distribuidora.trim(),
      descricao: formData.descricao.trim(),
      regulamento: formData.regulamento.trim(),
      objetivosGerais: formData.objetivosGerais.trim(),
      startDate: formData.startDate || null,
      endDate: formData.endDate || null,
      categorias: formData.categorias.split(',').map(c => c.trim()).filter(Boolean),
      active: !!formData.active,
      industries: buildIndustries(),
    };
    if (code.trim()) payload.code = code.trim();
    try {
      setSaving(true);
      if (isEdit) await campaignsService.editarMestre(mestre.id, payload);
      else await campaignsService.criarMestre(payload);
      toast.success(isEdit ? '✅ Campanha mestre atualizada!' : '✅ Campanha mestre criada!');
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error('Erro ao salvar: ' + (err?.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  const overlayClick = (e) => { if (e.target === e.currentTarget && !saving) onClose(); };

  return (
    <div className="modal-overlay" onClick={overlayClick}>
      <div className="modal-content-campaign" onClick={e => e.stopPropagation()}>
        <div className="campaign-modal-header">
          <h2>{isEdit ? '✏️ Editar Campanha Mestre' : '➕ Nova Campanha Mestre'}</h2>
          <button type="button" className="btn-close-campaign" onClick={onClose} aria-label="Fechar"><X size={20} strokeWidth={2.4} /></button>
        </div>

        <div className="campaign-modal-body">
          <div className="campaign-form-group">
            <label>Nome da Campanha *</label>
            <input type="text" value={formData.nome} onChange={e => setField('nome', e.target.value)} placeholder="Ex: Spani Julho 2026" className={errors.nome ? 'error' : ''} />
            {errors.nome && <span className="error-message">{errors.nome}</span>}
          </div>
          <div className="campaign-form-group">
            <label>Distribuidora / Rede</label>
            <input type="text" value={formData.distribuidora} onChange={e => setField('distribuidora', e.target.value)} placeholder="Ex: Spani" />
          </div>
          <div className="campaign-dates-row">
            <div className="campaign-form-group">
              <label>Início</label>
              <input type="date" value={formData.startDate} onChange={e => setField('startDate', e.target.value)} />
            </div>
            <div className="campaign-form-group">
              <label>Término</label>
              <input type="date" value={formData.endDate} onChange={e => setField('endDate', e.target.value)} />
            </div>
          </div>
          <div className="campaign-form-group">
            <label>Descrição</label>
            <textarea rows={2} value={formData.descricao} onChange={e => setField('descricao', e.target.value)} placeholder="Resumo da campanha" />
          </div>
          <div className="campaign-form-group">
            <label>Regulamento / Regras</label>
            <textarea rows={3} value={formData.regulamento} onChange={e => setField('regulamento', e.target.value)} placeholder="Regras, condições, mecânica..." />
          </div>
          <div className="campaign-form-group">
            <label>Objetivos gerais</label>
            <textarea rows={2} value={formData.objetivosGerais} onChange={e => setField('objetivosGerais', e.target.value)} />
          </div>
          <div className="campaign-form-group">
            <label>Categorias (separe por vírgula)</label>
            <input type="text" value={formData.categorias} onChange={e => setField('categorias', e.target.value)} placeholder="Ex: Chocolates, Biscoitos" />
          </div>
          <div className="campaign-form-group">
            <label><Lock size={13} style={{ verticalAlign: -1 }} /> Senha de acesso {isEdit ? '(deixe vazio p/ manter)' : '*'}</label>
            <input type="text" value={code} onChange={e => { setCode(e.target.value); if (errors.code) setErrors(er => ({ ...er, code: '' })); }} placeholder={isEdit ? '••••• (inalterada)' : 'Ex: spani2026'} className={errors.code ? 'error' : ''} />
            {errors.code && <span className="error-message">{errors.code}</span>}
          </div>
          <div className="campaign-form-group">
            <label>Status</label>
            <select value={formData.active ? '1' : '0'} onChange={e => setField('active', e.target.value === '1')}>
              <option value="1">Ativa (RCAs podem desbloquear)</option>
              <option value="0">Inativa (oculta / bloqueada)</option>
            </select>
          </div>

          {/* Indústrias adicionadas */}
          {formData.industries.length > 0 && (
            <div className="industries-list">
              <div className="industries-list-header">
                <div><h3>Indústrias participantes</h3><p>Produtos que os RCAs vão acompanhar.</p></div>
                <span>{formData.industries.length} indústria{formData.industries.length > 1 ? 's' : ''}</span>
              </div>
              <div className="industries-card-grid">
                {formData.industries.map(ind => (
                  <div key={ind.id} className="industry-item">
                    <div className="industry-header">
                      <div className="industry-header-info">
                        <span className="industry-label">Indústria</span>
                        <strong>{ind.name}</strong>
                        <small>{ind.products.length} produto{ind.products.length !== 1 ? 's' : ''}</small>
                      </div>
                      <div className="industry-header-actions">
                        <button type="button" className="btn-edit-industry" onClick={() => editIndustry(ind)}>Editar</button>
                        <button type="button" className="btn-remove-industry" onClick={() => removeIndustry(ind.id)} aria-label={`Remover ${ind.name}`}>
                          <Trash2 size={15} strokeWidth={2.4} />
                        </button>
                      </div>
                    </div>
                    <div className="industry-products">
                      <strong>Produtos</strong>
                      <div className="industry-product-list">
                        {ind.products.slice(0, 6).map(p => <span key={p.nome}>{p.nome}</span>)}
                        {ind.products.length > 6 && <span className="more-products">+{ind.products.length - 6}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {errors.industries && <span className="error-message">{errors.industries}</span>}

          {/* Adicionar/editar indústria */}
          <div className="add-industry-section">
            <h3>{editingIndustryId ? '✏️ Editar indústria' : '➕ Adicionar indústria'}</h3>
            <div className="campaign-form-group">
              <label>Nome da Indústria</label>
              <input type="text" value={currentIndustry.name} onChange={e => setCurrentIndustry(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Mondelez" />
            </div>
            <div className="campaign-form-group">
              <label>Produtos (nome + código/EAN opcionais)</label>
              <div className="input-with-button" style={{ flexWrap: 'wrap', gap: 8 }}>
                <input type="text" style={{ flex: '2 1 140px' }} value={prod.nome} onChange={e => setProd(p => ({ ...p, nome: e.target.value }))} placeholder="Nome do produto" onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addProduct())} />
                <input type="text" style={{ flex: '1 1 80px' }} value={prod.codigo} onChange={e => setProd(p => ({ ...p, codigo: e.target.value }))} placeholder="Código" />
                <input type="text" style={{ flex: '1 1 110px' }} value={prod.ean} onChange={e => setProd(p => ({ ...p, ean: e.target.value }))} placeholder="EAN" />
                <button type="button" className="btn-add-product" onClick={addProduct}>➕</button>
              </div>
              <button type="button" className="btn-pull-table" onClick={() => setShowTablePicker(true)}>
                <Table2 size={15} strokeWidth={2.4} /> Puxar da tabela da empresa
              </button>
              {currentIndustry.products.length > 0 && (
                <div className="products-tags">
                  {currentIndustry.products.map((p, i) => (
                    <span key={p.ean || p.nome || i} className="product-tag" title={p.ean ? `EAN ${p.ean}` : (p.codigo ? `Cód ${p.codigo}` : 'Sem código')}>
                      {p.nome}
                      <button type="button" onClick={() => removeProduct(p.nome)}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="btn-add-industry" onClick={saveIndustry}>
              {editingIndustryId ? '💾 Salvar indústria' : '➕ Adicionar Indústria'}
            </button>
            {editingIndustryId && (
              <button type="button" className="btn-cancel-campaign" style={{ width: '100%', marginTop: 8 }} onClick={cancelIndustryEdit}>Cancelar edição</button>
            )}
          </div>
        </div>

        <div className="campaign-modal-footer">
          <button type="button" className="btn-cancel-campaign" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="btn-save-campaign" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : (isEdit ? '💾 Salvar Alterações' : '💾 Criar Campanha Mestre')}
          </button>
        </div>
      </div>

      {showTablePicker && (
        <TabelaPickerModal onClose={() => setShowTablePicker(false)} onAdd={addFromTable} ctaLabel="à campanha" />
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={() => { confirmDialog.onConfirm?.(); setConfirmDialog(d => ({ ...d, open: false })); }}
        onCancel={() => setConfirmDialog(d => ({ ...d, open: false }))}
      />
    </div>
  );
}
