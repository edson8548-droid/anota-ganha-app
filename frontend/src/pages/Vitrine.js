import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Store, Plus, Pencil, Trash2, Copy, Eye, X, Check, Image, Search } from 'lucide-react';
import { vitrineService } from '../services/vitrine.service';
import './Vitrine.css';

const API_URL = 'https://api.venpro.com.br';

const UNIDADES = ['UN', 'CX', 'FD', 'PC', 'PCT', 'KG', 'L', 'ML', 'G', 'FRD', 'BAG'];

export default function Vitrine() {
  const navigate = useNavigate();
  const [view, setView] = useState('lista'); // 'lista' | 'nova' | 'revisao'
  const [ofertas, setOfertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState(null);

  // Form criar oferta
  const [form, setForm] = useState({
    title: '', company_name: '', rca_name: '',
    rca_whatsapp: '', minimum_order_value: '', expires_at: '', notes: '',
  });
  const [logoFile, setLogoFile] = useState(null);
  const [listaTexto, setListaTexto] = useState('');
  const [itensParsed, setItensParsed] = useState([]);
  const [editandoOferta, setEditandoOferta] = useState(null); // para editar dados da oferta salva

  const logoInputRef = useRef(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await vitrineService.listar();
      setOfertas(res.data.filter(o => o.status !== 'deleted'));
    } catch {
      toast.error('Erro ao carregar vitrines');
    }
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Copiar link ──────────────────────────────────────
  const copiarLink = (slug) => {
    const link = `${window.location.origin}/oferta/${slug}`;
    navigator.clipboard.writeText(link);
    setCopiedSlug(slug);
    toast.success('Link copiado!');
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  // ── Toggle ativo/inativo ─────────────────────────────
  const toggleStatus = async (oferta) => {
    const novoStatus = oferta.status === 'active' ? 'inactive' : 'active';
    try {
      await vitrineService.atualizar(oferta._id, { status: novoStatus });
      toast.success(novoStatus === 'active' ? 'Vitrine ativada' : 'Vitrine desativada');
      carregar();
    } catch {
      toast.error('Erro ao alterar status');
    }
  };

  // ── Excluir ──────────────────────────────────────────
  const excluir = async (id) => {
    if (!window.confirm('Excluir esta vitrine? Esta ação não pode ser desfeita.')) return;
    try {
      await vitrineService.excluir(id);
      toast.success('Vitrine excluída');
      carregar();
    } catch {
      toast.error('Erro ao excluir');
    }
  };

  // ── Parse de lista ───────────────────────────────────
  const parsearLista = async () => {
    if (!listaTexto.trim()) { toast.warning('Cole uma lista primeiro'); return; }
    setParsing(true);
    try {
      const res = await vitrineService.parseLista(listaTexto);
      const items = res.data.items.map((item, i) => ({
        ...item,
        _key: `item-${i}-${Date.now()}`,
        _imageFile: null,
        _imagePreview: null,
        price: String(item.price ?? ''),
        units_per_package: item.units_per_package ? String(item.units_per_package) : '',
      }));
      setItensParsed(items);
      toast.success(`${items.length} produtos interpretados — revise e ajuste`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao interpretar lista');
    }
    setParsing(false);
  };

  const updateItem = (key, field, value) => {
    setItensParsed(prev => prev.map(it => it._key === key ? { ...it, [field]: value } : it));
  };

  const removeItem = (key) => {
    setItensParsed(prev => prev.filter(it => it._key !== key));
  };

  const addItemManual = () => {
    setItensParsed(prev => [...prev, {
      _key: `item-manual-${Date.now()}`,
      product_name: '', price: '', unit: 'UN',
      units_per_package: '', ean: '', category: '',
      _imageFile: null, _imagePreview: null,
    }]);
  };

  const handleImagePick = (key, file) => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setItensParsed(prev => prev.map(it =>
      it._key === key ? { ...it, _imageFile: file, _imagePreview: preview, _imageUrl: null } : it
    ));
  };

  const handleSearchImage = async (key, productName) => {
    if (!productName?.trim()) { toast.warning('Digite o nome do produto primeiro'); return; }
    setItensParsed(prev => prev.map(it => it._key === key ? { ...it, _searching: true } : it));
    try {
      const res = await vitrineService.sugerirImagem(productName);
      if (res.data.found && res.data.image_url) {
        setItensParsed(prev => prev.map(it =>
          it._key === key ? { ...it, _imagePreview: res.data.image_url, _imageUrl: res.data.image_url, _imageFile: null, _searching: false } : it
        ));
        toast.success('Imagem encontrada!');
      } else {
        toast.warning('Nenhuma imagem encontrada para este produto');
        setItensParsed(prev => prev.map(it => it._key === key ? { ...it, _searching: false } : it));
      }
    } catch {
      toast.error('Erro ao buscar imagem');
      setItensParsed(prev => prev.map(it => it._key === key ? { ...it, _searching: false } : it));
    }
  };

  // ── Salvar oferta completa ───────────────────────────
  const salvarOferta = async () => {
    if (!form.title.trim() || !form.company_name.trim() || !form.rca_name.trim() || !form.rca_whatsapp.trim()) {
      toast.warning('Preencha: título, empresa, seu nome e WhatsApp');
      return;
    }
    if (itensParsed.length === 0) {
      toast.warning('Adicione pelo menos um produto');
      return;
    }
    setSaving(true);
    try {
      // 1. Criar oferta sem itens
      const ofertaRes = await vitrineService.criar({
        title: form.title,
        company_name: form.company_name,
        rca_name: form.rca_name,
        rca_whatsapp: form.rca_whatsapp.replace(/\D/g, ''),
        minimum_order_value: form.minimum_order_value ? parseFloat(form.minimum_order_value) : null,
        expires_at: form.expires_at || null,
        notes: form.notes || null,
        items: itensParsed.map((it, i) => ({
          product_name: it.product_name,
          product_code: it.product_code || null,
          ean: it.ean || null,
          category: it.category || null,
          price: parseFloat(it.price) || 0,
          unit: it.unit || 'UN',
          units_per_package: it.units_per_package ? parseInt(it.units_per_package) : null,
          unit_price: it.unit_price ? parseFloat(it.unit_price) : null,
          image_url: it._imageUrl || null,
          sort_order: i,
          active: true,
        })),
      });

      const oferta = ofertaRes.data;

      // 2. Upload de logo
      if (logoFile) {
        try { await vitrineService.uploadLogo(oferta._id, logoFile); } catch {}
      }

      // 3. Upload de imagens dos itens
      const itemsComImagem = itensParsed.filter(it => it._imageFile);
      for (let i = 0; i < itemsComImagem.length; i++) {
        const it = itemsComImagem[i];
        const itemSalvo = oferta.items?.find(
          saved => saved.product_name === it.product_name && saved.sort_order === itensParsed.indexOf(it)
        ) || oferta.items?.[itensParsed.indexOf(it)];
        if (itemSalvo?.id) {
          try {
            await vitrineService.uploadImagem(oferta._id, itemSalvo.id, it._imageFile);
          } catch {}
        }
      }

      toast.success('Vitrine criada com sucesso!');
      resetForm();
      setView('lista');
      carregar();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao salvar vitrine');
    }
    setSaving(false);
  };

  const resetForm = () => {
    setForm({ title: '', company_name: '', rca_name: '', rca_whatsapp: '', minimum_order_value: '', expires_at: '', notes: '' });
    setLogoFile(null);
    setListaTexto('');
    setItensParsed([]);
  };

  const fmtPreco = (v) => `R$ ${parseFloat(v || 0).toFixed(2).replace('.', ',')}`;

  // ════════════════════════════════════════════════════
  // RENDER — LISTA
  // ════════════════════════════════════════════════════
  if (view === 'lista') return (
    <div className="vt-page">
      <header className="vt-header">
        <div className="vt-header-left">
          <button className="vt-btn-back" onClick={() => navigate('/dashboard')}>← Voltar</button>
          <div style={{ width: 1, height: 20, background: '#4A4D52' }} />
          <div>
            <div className="vt-header-title">Vitrine Inteligente</div>
            <div className="vt-header-sub">Catálogo B2B por link</div>
          </div>
        </div>
      </header>

      <div className="vt-body">
        <div className="vt-list-header">
          <div>
            <div className="vt-list-title">Minhas Vitrines</div>
            <div className="vt-list-sub">{ofertas.length}/3 vitrines criadas</div>
          </div>
          <button
            className="vt-btn-new"
            onClick={() => setView('nova')}
            disabled={ofertas.length >= 3}
          >
            <Plus size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Nova Vitrine
          </button>
        </div>

        {ofertas.length >= 3 && (
          <div className="vt-limit-info">
            ℹ️ Você atingiu o limite de 3 vitrines. Exclua uma para criar outra.
          </div>
        )}

        {loading ? (
          [1,2].map(i => (
            <div key={i} className="vt-card">
              <span className="skeleton" style={{ display:'block', height:16, width:'40%', borderRadius:6, marginBottom:10 }} />
              <span className="skeleton" style={{ display:'block', height:12, width:'60%', borderRadius:6 }} />
            </div>
          ))
        ) : ofertas.length === 0 ? (
          <div className="vt-empty">
            <div className="vt-empty-ico"><Store size={48} /></div>
            <div className="vt-empty-title">Nenhuma vitrine criada</div>
            <div className="vt-empty-sub">Crie sua primeira vitrine, adicione produtos e gere um link profissional para enviar aos seus clientes.</div>
            <button className="vt-btn-new" style={{ marginTop: 20 }} onClick={() => setView('nova')}>
              Criar primeira vitrine
            </button>
          </div>
        ) : (
          ofertas.map(oferta => (
            <div key={oferta._id} className="vt-card">
              <div className="vt-card-top">
                <div className="vt-card-info">
                  <div className="vt-card-title">{oferta.title}</div>
                  <div className="vt-card-meta">
                    <span>{oferta.company_name}</span>
                    <span>{oferta.items?.length || 0} produtos</span>
                    {oferta.expires_at && <span>Válido até {new Date(oferta.expires_at).toLocaleDateString('pt-BR')}</span>}
                  </div>
                </div>
                <span className={`vt-badge ${oferta.status === 'active' ? 'active' : 'inactive'}`}>
                  {oferta.status === 'active' ? '● Ativa' : '○ Inativa'}
                </span>
              </div>
              <div className="vt-card-actions">
                <div className="vt-link-box">
                  {`${window.location.origin}/oferta/${oferta.slug}`}
                </div>
                <button className="vt-btn-sm" title="Copiar link" onClick={() => copiarLink(oferta.slug)}>
                  {copiedSlug === oferta.slug ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button className="vt-btn-sm" title="Ver vitrine" onClick={() => window.open(`/oferta/${oferta.slug}`, '_blank')}>
                  <Eye size={14} />
                </button>
                <button className="vt-btn-sm primary" onClick={() => navigate(`/vitrine/${oferta._id}/editar`)}>
                  <Pencil size={13} style={{ marginRight: 4 }} /> Editar
                </button>
                <button className="vt-btn-sm" onClick={() => toggleStatus(oferta)}>
                  {oferta.status === 'active' ? 'Desativar' : 'Ativar'}
                </button>
                <button className="vt-btn-sm danger" onClick={() => excluir(oferta._id)}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════
  // RENDER — CRIAR NOVA VITRINE
  // ════════════════════════════════════════════════════
  return (
    <div className="vt-page">
      <header className="vt-header">
        <div className="vt-header-left">
          <button className="vt-btn-back" onClick={() => { resetForm(); setView('lista'); }}>← Vitrines</button>
          <div style={{ width: 1, height: 20, background: '#4A4D52' }} />
          <div>
            <div className="vt-header-title">Nova Vitrine</div>
            <div className="vt-header-sub">Crie seu catálogo B2B</div>
          </div>
        </div>
      </header>

      <div className="vt-body">
        <div className="vt-form">

          {/* Seção 1 — Dados da oferta */}
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
                  {logoFile ? `✓ ${logoFile.name}` : 'Clique para enviar logo'}
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
              <textarea className="vt-input vt-textarea" placeholder="Ex: Prazo de pagamento: 28 dias. Entrega mínima 2 caixas por produto."
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>

          {/* Seção 2 — Produtos */}
          <div className="vt-form-section">
            <div className="vt-form-section-title">📦 Produtos</div>

            {/* Cole lista */}
            <div className="vt-paste-area">
              <label className="vt-label">Cole sua lista de produtos</label>
              <textarea className="vt-input vt-textarea"
                placeholder={"AGUA SANITARIA YPE 2L R$ 8,54 UN CX 8UN\nLAVA ROUPA PO ASSIM 800G R$ 119,00 CX 20UN\nVEJA MULTIUSO 500ML R$ 3,72 UN"}
                value={listaTexto} onChange={e => setListaTexto(e.target.value)} rows={5} />
              <div className="vt-paste-hint">
                Cole uma linha por produto. A IA interpreta nome, preço, unidade e quantidade por embalagem.
              </div>
              <div style={{ display:'flex', gap:10, marginTop:12 }}>
                <button className="vt-btn-primary" onClick={parsearLista} disabled={parsing || !listaTexto.trim()}>
                  {parsing ? '⏳ Interpretando...' : '✨ Interpretar lista'}
                </button>
                <button className="vt-btn-secondary" onClick={addItemManual}>
                  + Adicionar manualmente
                </button>
              </div>
            </div>

            {/* Lista de revisão */}
            {itensParsed.length > 0 && (
              <>
                <div style={{ fontSize:13, color:'#A0A3A8', marginBottom:12 }}>
                  {itensParsed.length} produto(s) — revise e ajuste antes de salvar
                </div>
                <div className="vt-review-list">
                  {itensParsed.map(item => (
                    <ItemReview
                      key={item._key}
                      item={item}
                      onChange={(field, value) => updateItem(item._key, field, value)}
                      onRemove={() => removeItem(item._key)}
                      onImageChange={(file) => handleImagePick(item._key, file)}
                      onSearchImage={() => handleSearchImage(item._key, item.product_name)}
                    />
                  ))}
                </div>
                <button className="vt-btn-secondary" style={{ marginTop:12 }} onClick={addItemManual}>
                  + Adicionar produto
                </button>
              </>
            )}
          </div>

          {/* Ações */}
          <div className="vt-form-actions">
            <button className="vt-btn-secondary" onClick={() => { resetForm(); setView('lista'); }}>
              Cancelar
            </button>
            <button className="vt-btn-primary" onClick={salvarOferta} disabled={saving}>
              {saving ? '⏳ Salvando...' : '🚀 Criar Vitrine e Gerar Link'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════
// COMPONENTE — Revisar item
// ════════════════════════════════════════════════════
function ItemReview({ item, onChange, onRemove, onImageChange, onSearchImage }) {
  const imgRef = useRef(null);

  return (
    <div className="vt-review-item">
      <div className="vt-review-item-header">
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {/* Imagem */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <div className="vt-img-box" onClick={() => imgRef.current?.click()} title="Clique para trocar foto">
              {item._imagePreview
                ? <img src={item._imagePreview} alt="" />
                : <Image size={22} />
              }
              <div className="vt-img-overlay">Foto</div>
              <input type="file" accept="image/*" ref={imgRef} style={{ display:'none' }}
                onChange={e => onImageChange(e.target.files[0])} />
            </div>
            <button
              title="Buscar foto no Google"
              onClick={onSearchImage}
              disabled={item._searching}
              style={{ background: item._imagePreview ? 'rgba(58,133,168,.15)' : '#363940', border: '1px solid #4A4D52', borderRadius: 6, cursor:'pointer', color: item._imagePreview ? '#3A85A8' : '#A0A3A8', padding:'4px 8px', display:'flex', alignItems:'center', gap: 4, fontSize: 11, fontWeight: 600 }}
            >
              {item._searching ? '...' : <><Search size={12} /> Foto</>}
            </button>
          </div>
          <div className="vt-review-item-name">
            <input
              value={item.product_name}
              onChange={e => onChange('product_name', e.target.value)}
              style={{ background:'transparent', border:'none', outline:'none', color:'#E1E1E1', fontSize:14, fontWeight:700, width:'100%' }}
              placeholder="Nome do produto"
            />
          </div>
        </div>
        <button className="vt-btn-remove" onClick={onRemove} title="Remover">
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
          <select value={item.unit} onChange={e => onChange('unit', e.target.value)}>
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
