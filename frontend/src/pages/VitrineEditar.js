import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Store, Plus, X, Image, Search } from 'lucide-react';
import { vitrineService } from '../services/vitrine.service';
import './Vitrine.css';

const API_URL = 'https://api.venpro.com.br';
const UNIDADES = ['UN', 'CX', 'FD', 'PC', 'PCT', 'KG', 'L', 'ML', 'G', 'FRD', 'BAG'];

function imgUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${API_URL}${path}`;
}

export default function VitrineEditar() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);

  const [form, setForm] = useState({
    title: '', company_name: '', rca_name: '',
    rca_whatsapp: '', minimum_order_value: '', expires_at: '', notes: '',
  });
  const [logoFile, setLogoFile] = useState(null);
  const [listaTexto, setListaTexto] = useState('');
  const [itens, setItens] = useState([]);

  const logoInputRef = useRef(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await vitrineService.obter(id);
      const oferta = res.data;
      setForm({
        title: oferta.title || '',
        company_name: oferta.company_name || '',
        rca_name: oferta.rca_name || '',
        rca_whatsapp: oferta.rca_whatsapp || '',
        minimum_order_value: oferta.minimum_order_value ? String(oferta.minimum_order_value) : '',
        expires_at: oferta.expires_at ? oferta.expires_at.split('T')[0] : '',
        notes: oferta.notes || '',
      });
      setItens((oferta.items || []).map((item, i) => ({
        ...item,
        price: String(item.price ?? ''),
        units_per_package: item.units_per_package ? String(item.units_per_package) : '',
        _key: `existing-${item.id || i}`,
        _imageFile: null,
        _imagePreview: null,
        _deleted: false,
      })));
    } catch {
      toast.error('Erro ao carregar vitrine');
      navigate('/vitrine');
    }
    setLoading(false);
  }, [id, navigate]);

  useEffect(() => { carregar(); }, [carregar]);

  const updateItem = (key, field, value) =>
    setItens(prev => prev.map(it => it._key === key ? { ...it, [field]: value } : it));

  const deleteItem = (key) =>
    setItens(prev => prev.map(it => it._key === key ? { ...it, _deleted: true } : it));

  const restoreItem = (key) =>
    setItens(prev => prev.map(it => it._key === key ? { ...it, _deleted: false } : it));

  const addItemManual = () =>
    setItens(prev => [...prev, {
      _key: `new-${Date.now()}`,
      product_name: '', price: '', unit: 'UN',
      units_per_package: '', ean: '', category: '',
      _imageFile: null, _imagePreview: null, _deleted: false,
    }]);

  const handleImagePick = (key, file) => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setItens(prev => prev.map(it =>
      it._key === key ? { ...it, _imageFile: file, _imagePreview: preview, _imageUrl: null } : it
    ));
  };

  const handleSearchImage = async (key, productName) => {
    if (!productName?.trim()) { toast.warning('Digite o nome do produto primeiro'); return; }
    setItens(prev => prev.map(it => it._key === key ? { ...it, _searching: true } : it));
    try {
      const res = await vitrineService.sugerirImagem(productName);
      if (res.data.found && res.data.image_url) {
        setItens(prev => prev.map(it =>
          it._key === key ? { ...it, _imagePreview: res.data.image_url, _imageUrl: res.data.image_url, _imageFile: null, _searching: false } : it
        ));
        toast.success('Imagem encontrada!');
      } else {
        toast.warning('Nenhuma imagem encontrada para este produto');
        setItens(prev => prev.map(it => it._key === key ? { ...it, _searching: false } : it));
      }
    } catch {
      toast.error('Erro ao buscar imagem');
      setItens(prev => prev.map(it => it._key === key ? { ...it, _searching: false } : it));
    }
  };

  const parsearLista = async () => {
    if (!listaTexto.trim()) { toast.warning('Cole uma lista primeiro'); return; }
    setParsing(true);
    try {
      const res = await vitrineService.parseLista(listaTexto);
      const novos = res.data.items.map((item, i) => ({
        ...item,
        _key: `parsed-${i}-${Date.now()}`,
        _imageFile: null,
        _imagePreview: null,
        _deleted: false,
        price: String(item.price ?? ''),
        units_per_package: item.units_per_package ? String(item.units_per_package) : '',
      }));
      setItens(prev => [...prev, ...novos]);
      setListaTexto('');
      toast.success(`${novos.length} produto(s) adicionados — revise e salve`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao interpretar lista');
    }
    setParsing(false);
  };

  const salvar = async () => {
    if (!form.title.trim() || !form.company_name.trim() || !form.rca_name.trim() || !form.rca_whatsapp.trim()) {
      toast.warning('Preencha: título, empresa, seu nome e WhatsApp');
      return;
    }
    const itensAtivos = itens.filter(it => !it._deleted);
    if (itensAtivos.length === 0) {
      toast.warning('A vitrine precisa ter pelo menos um produto');
      return;
    }
    setSaving(true);
    try {
      await vitrineService.atualizar(id, {
        title: form.title,
        company_name: form.company_name,
        rca_name: form.rca_name,
        rca_whatsapp: form.rca_whatsapp.replace(/\D/g, ''),
        minimum_order_value: form.minimum_order_value ? parseFloat(form.minimum_order_value) : null,
        expires_at: form.expires_at || null,
        notes: form.notes || null,
      });

      if (logoFile) {
        try { await vitrineService.uploadLogo(id, logoFile); } catch {}
      }

      for (const it of itens.filter(it => it._deleted && it.id)) {
        try { await vitrineService.removerItem(id, it.id); } catch {}
      }

      const existentes = itens.filter(it => !it._deleted && it.id);
      for (const it of existentes) {
        try {
          await vitrineService.atualizarItem(id, it.id, {
            product_name: it.product_name,
            ean: it.ean || null,
            category: it.category || null,
            price: parseFloat(it.price) || 0,
            unit: it.unit || 'UN',
            units_per_package: it.units_per_package ? parseInt(it.units_per_package) : null,
            ...(it._imageUrl ? { image_url: it._imageUrl } : {}),
          });
          if (it._imageFile) {
            await vitrineService.uploadImagem(id, it.id, it._imageFile);
          }
        } catch {}
      }

      const novos = itens.filter(it => !it._deleted && !it.id);
      for (let i = 0; i < novos.length; i++) {
        const it = novos[i];
        try {
          const res = await vitrineService.adicionarItem(id, {
            product_name: it.product_name,
            ean: it.ean || null,
            category: it.category || null,
            price: parseFloat(it.price) || 0,
            unit: it.unit || 'UN',
            units_per_package: it.units_per_package ? parseInt(it.units_per_package) : null,
            unit_price: null,
            image_url: it._imageUrl || null,
            sort_order: existentes.length + i,
            active: true,
          });
          const novoId = res.data?.id;
          if (it._imageFile && novoId) {
            try { await vitrineService.uploadImagem(id, novoId, it._imageFile); } catch {}
          }
        } catch {}
      }

      toast.success('Vitrine atualizada!');
      navigate('/vitrine');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao salvar');
    }
    setSaving(false);
  };

  if (loading) return (
    <div className="vt-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#A0A3A8', fontSize: 15 }}>
      Carregando vitrine...
    </div>
  );

  const itensVisiveis = itens.filter(it => !it._deleted);
  const itensRemovidos = itens.filter(it => it._deleted);

  return (
    <div className="vt-page">
      <header className="vt-header">
        <div className="vt-header-left">
          <button className="vt-btn-back" onClick={() => navigate('/vitrine')}>← Vitrines</button>
          <div style={{ width: 1, height: 20, background: '#4A4D52' }} />
          <div>
            <div className="vt-header-title">Editar Vitrine</div>
            <div className="vt-header-sub">{form.title}</div>
          </div>
        </div>
      </header>

      <div className="vt-body">
        <div className="vt-form">

          {/* Dados da oferta */}
          <div className="vt-form-section">
            <div className="vt-form-section-title"><Store size={16} /> Dados da Oferta</div>

            <div className="vt-field">
              <label className="vt-label">Nome da oferta / campanha *</label>
              <input className="vt-input" placeholder="Ex: Oferta de Higiene — Abril 2026"
                value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>

            <div className="vt-row col2">
              <div className="vt-field">
                <label className="vt-label">Nome da empresa *</label>
                <input className="vt-input" placeholder="Ex: Distribuidora Silva"
                  value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} />
              </div>
              <div className="vt-field">
                <label className="vt-label">Logo da empresa</label>
                <input type="file" accept="image/*" ref={logoInputRef} style={{ display: 'none' }}
                  onChange={e => setLogoFile(e.target.files[0])} />
                <button className="vt-input" style={{ textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => logoInputRef.current?.click()}>
                  {logoFile ? `✓ ${logoFile.name}` : 'Clique para trocar logo'}
                </button>
              </div>
            </div>

            <div className="vt-row col2">
              <div className="vt-field">
                <label className="vt-label">Seu nome (RCA) *</label>
                <input className="vt-input" placeholder="Ex: João Silva"
                  value={form.rca_name} onChange={e => setForm(f => ({ ...f, rca_name: e.target.value }))} />
              </div>
              <div className="vt-field">
                <label className="vt-label">Seu WhatsApp * (receberá o pedido)</label>
                <input className="vt-input" placeholder="Ex: 13999990000"
                  value={form.rca_whatsapp} onChange={e => setForm(f => ({ ...f, rca_whatsapp: e.target.value }))} />
              </div>
            </div>

            <div className="vt-row col2">
              <div className="vt-field">
                <label className="vt-label">Pedido mínimo (R$)</label>
                <input className="vt-input" type="number" placeholder="Ex: 300"
                  value={form.minimum_order_value} onChange={e => setForm(f => ({ ...f, minimum_order_value: e.target.value }))} />
              </div>
              <div className="vt-field">
                <label className="vt-label">Validade da oferta</label>
                <input className="vt-input" type="date"
                  value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
              </div>
            </div>

            <div className="vt-field">
              <label className="vt-label">Observação (aparece na vitrine)</label>
              <textarea className="vt-input vt-textarea" placeholder="Ex: Prazo de pagamento: 28 dias."
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>

          {/* Produtos */}
          <div className="vt-form-section">
            <div className="vt-form-section-title">
              📦 Produtos
              <span style={{ marginLeft: 8, fontSize: 12, color: '#6B6E74', fontWeight: 400 }}>
                {itensVisiveis.length} produto{itensVisiveis.length !== 1 ? 's' : ''}
              </span>
            </div>

            {itensVisiveis.length > 0 ? (
              <div className="vt-review-list">
                {itensVisiveis.map(item => (
                  <ItemReviewEditar
                    key={item._key}
                    item={item}
                    onChange={(field, value) => updateItem(item._key, field, value)}
                    onDelete={() => deleteItem(item._key)}
                    onImageChange={(file) => handleImagePick(item._key, file)}
                    onSearchImage={() => handleSearchImage(item._key, item.product_name)}
                  />
                ))}
              </div>
            ) : (
              <div style={{ padding: '16px 0', color: '#6B6E74', fontSize: 13 }}>
                Nenhum produto. Adicione produtos abaixo.
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <button className="vt-btn-secondary" onClick={addItemManual}>
                <Plus size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                Adicionar produto
              </button>
            </div>

            {/* Adicionar via lista */}
            <div className="vt-paste-area" style={{ marginTop: 16 }}>
              <label className="vt-label">Adicionar mais produtos via lista</label>
              <textarea className="vt-input vt-textarea"
                placeholder={"SABAO PO ASSIM 800G R$ 5,90 UN CX 20UN\n..."}
                value={listaTexto} onChange={e => setListaTexto(e.target.value)} rows={3} />
              <div style={{ marginTop: 10 }}>
                <button className="vt-btn-primary" onClick={parsearLista} disabled={parsing || !listaTexto.trim()}>
                  {parsing ? '⏳ Interpretando...' : '✨ Interpretar e adicionar'}
                </button>
              </div>
            </div>

            {/* Itens marcados para remoção */}
            {itensRemovidos.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, color: '#6B6E74', marginBottom: 8 }}>
                  {itensRemovidos.length} produto{itensRemovidos.length !== 1 ? 's' : ''} marcado{itensRemovidos.length !== 1 ? 's' : ''} para remover:
                </div>
                {itensRemovidos.map(it => (
                  <div key={it._key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: '#ef4444', textDecoration: 'line-through' }}>
                      {it.product_name || 'Produto sem nome'}
                    </span>
                    <button className="vt-btn-sm" onClick={() => restoreItem(it._key)} style={{ fontSize: 11 }}>
                      ↩ Restaurar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="vt-form-actions">
            <button className="vt-btn-secondary" onClick={() => navigate('/vitrine')}>
              Cancelar
            </button>
            <button className="vt-btn-primary" onClick={salvar} disabled={saving}>
              {saving ? '⏳ Salvando...' : '💾 Salvar Alterações'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

function ItemReviewEditar({ item, onChange, onDelete, onImageChange, onSearchImage }) {
  const imgRef = useRef(null);
  const currentImg = item._imagePreview || imgUrl(item.image_url);

  return (
    <div className="vt-review-item">
      <div className="vt-review-item-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div className="vt-img-box" onClick={() => imgRef.current?.click()} title="Clique para trocar foto">
              {currentImg
                ? <img src={currentImg} alt="" />
                : <Image size={22} />
              }
              <div className="vt-img-overlay">Foto</div>
              <input type="file" accept="image/*" ref={imgRef} style={{ display: 'none' }}
                onChange={e => onImageChange(e.target.files[0])} />
            </div>
            <button
              title="Buscar foto no Google"
              onClick={onSearchImage}
              disabled={item._searching}
              style={{ background: currentImg ? 'rgba(58,133,168,.15)' : '#363940', border: '1px solid #4A4D52', borderRadius: 6, cursor: 'pointer', color: currentImg ? '#3A85A8' : '#A0A3A8', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600 }}
            >
              {item._searching ? '...' : <><Search size={12} /> Foto</>}
            </button>
          </div>
          <div className="vt-review-item-name">
            <input
              value={item.product_name}
              onChange={e => onChange('product_name', e.target.value)}
              style={{ background: 'transparent', border: 'none', outline: 'none', color: '#E1E1E1', fontSize: 14, fontWeight: 700, width: '100%' }}
              placeholder="Nome do produto"
            />
          </div>
        </div>
        <button className="vt-btn-remove" onClick={onDelete} title="Remover produto">
          <X size={16} />
        </button>
      </div>

      <div className="vt-review-item-fields">
        <div className="vt-review-field">
          <label>Preço (R$)</label>
          <input type="number" step="0.01" value={item.price}
            onChange={e => onChange('price', e.target.value)} placeholder="0,00" />
        </div>
        <div className="vt-review-field">
          <label>Unidade</label>
          <select value={item.unit || 'UN'} onChange={e => onChange('unit', e.target.value)}>
            {UNIDADES.map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
        <div className="vt-review-field">
          <label>Qtd por embalagem</label>
          <input type="number" value={item.units_per_package}
            onChange={e => onChange('units_per_package', e.target.value)} placeholder="Ex: 12" />
        </div>
        <div className="vt-review-field">
          <label>Código / EAN</label>
          <input value={item.ean || ''} onChange={e => onChange('ean', e.target.value)} placeholder="Opcional" />
        </div>
        <div className="vt-review-field">
          <label>Categoria</label>
          <input value={item.category || ''} onChange={e => onChange('category', e.target.value)} placeholder="Ex: Limpeza" />
        </div>
      </div>
    </div>
  );
}
