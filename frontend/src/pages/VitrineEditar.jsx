import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Store, Plus, X, Image, Search, Table2 } from 'lucide-react';
import { vitrineService } from '../services/vitrine.service';
import TabelaPickerModal from '../components/TabelaPickerModal';
import { backendUrl } from '../config/api';
import './Vitrine.css';

const UNIDADES = ['UN', 'CX', 'FD', 'PC', 'PCT', 'KG', 'L', 'ML', 'G', 'FRD', 'BAG'];

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStoredImageUrl = (value) => {
  if (!value) return null;
  const text = String(value);
  const marker = '/api/vitrine/imagens/';
  const index = text.indexOf(marker);
  if (index >= 0) return text.slice(index);
  return text.startsWith('https://') ? text : null;
};

const buildItemPayload = (it, sortOrder) => {
  const unitPrice = toNumber(it.price);
  const unitsPerPackage = it.units_per_package ? parseInt(it.units_per_package) || null : null;
  return {
    product_name: it.product_name,
    ean: it.ean || null,
    category: it.category || null,
    price: unitsPerPackage ? Number((unitPrice * unitsPerPackage).toFixed(2)) : unitPrice,
    unit: it.unit || 'UN',
    units_per_package: unitsPerPackage,
    unit_price: unitPrice,
    image_url: normalizeStoredImageUrl(it._imageUrl || it.image_url),
    sort_order: sortOrder,
    active: true,
  };
};

const buildBulkItemPayload = (it, sortOrder) => {
  const payload = buildItemPayload(it, sortOrder);
  if (it.id) payload.id = it.id;
  return payload;
};

const getItemsWithoutPhoto = (items) => items.filter(it =>
  !it._deleted && !it._imageFile && !(it._imagePreview || it._imageUrl || it.image_url)
);

function imgUrl(path) {
  if (!path) return null;
  const value = String(path);
  if (value.startsWith('http')) return value;
  return backendUrl(value);
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
  const [imagePicker, setImagePicker] = useState(null);
  const [tabelaPickerAberto, setTabelaPickerAberto] = useState(false);

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
        expires_at: oferta.expires_at ? String(oferta.expires_at).split('T')[0] : '',
        notes: oferta.notes || '',
      });
      setItens((oferta.items || []).map((item, i) => ({
        ...item,
        price: String(item.unit_price ?? item.price ?? ''),
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

  const handleSearchImage = async (key, productName, ean) => {
    if (!productName?.trim()) { toast.warning('Digite o nome do produto primeiro'); return; }
    setImagePicker({ key, productName, loading: true, images: [] });
    try {
      const res = await vitrineService.sugerirImagens(productName, ean);
      const images = res.data.images || [];
      if (images.length) {
        setImagePicker({ key, productName, loading: false, images });
      } else {
        toast.warning('Nenhuma imagem encontrada para este produto');
        setImagePicker(null);
      }
    } catch {
      toast.error('Erro ao buscar imagem');
      setImagePicker(null);
    }
  };

  const selecionarImagem = async (imageUrl) => {
    if (!imagePicker?.key || !imageUrl) return;
    const selectedItem = itens.find(it => it._key === imagePicker.key);
    setItens(prev => prev.map(it =>
      it._key === imagePicker.key
        ? { ...it, _imagePreview: imageUrl, _imageUrl: imageUrl, _imageFile: null }
        : it
    ));
    setImagePicker(null);
    try {
      const res = await vitrineService.aprenderImagem(
        selectedItem?.product_name || imagePicker.productName,
        imageUrl,
        selectedItem?.ean || null,
      );
      if (res.data?.image_url && res.data.image_url !== imageUrl) {
        setItens(prev => prev.map(it =>
          it._key === imagePicker.key
            ? { ...it, _imagePreview: vitrineService.imagemUrl(res.data.image_url), _imageUrl: res.data.image_url, _imageFile: null }
            : it
        ));
      }
      toast.success('Foto trocada e salva para as próximas vitrines');
    } catch {
      toast.success('Foto trocada');
    }
  };

  const adicionarDaTabela = (produtos) => {
    const stamp = Date.now();
    const novos = produtos.map((p, i) => ({
      _key: `tabela-${i}-${stamp}`,
      product_name: p.nome || '',
      ean: p.ean || '',
      category: '',
      price: p.preco != null ? String(p.preco) : '',
      unit: 'UN',
      units_per_package: p.qtd_caixa ? String(p.qtd_caixa) : '',
      _imageFile: null,
      _imagePreview: p.foto_url ? vitrineService.imagemUrl(p.foto_url) : null,
      _imageUrl: p.foto_url || null,
      _deleted: false,
      _searching: !p.foto_url,
    }));
    setItens(prev => [...prev, ...novos]);
    setTabelaPickerAberto(false);
    const comFotoBanco = novos.filter(n => n._imageUrl).length;
    toast.success(`${novos.length} produto(s) adicionados${comFotoBanco ? ` (${comFotoBanco} com foto do banco)` : ''} — revise e salve`);
    buscarImagensAutomaticamente(novos.filter(n => !n._imageUrl));
  };

  const parsearLista = async () => {
    if (!listaTexto.trim()) { toast.warning('Cole uma lista primeiro'); return; }
    setParsing(true);
    try {
      const res = await vitrineService.parseLista(listaTexto);
      const stamp = Date.now();
      const novos = res.data.items.map((item, i) => ({
        ...item,
        _key: `parsed-${i}-${stamp}`,
        _imageFile: null,
        _imagePreview: null,
        _deleted: false,
        _searching: true,
        price: String(item.unit_price ?? item.price ?? ''),
        units_per_package: item.units_per_package ? String(item.units_per_package) : '',
      }));
      setItens(prev => [...prev, ...novos]);
      setListaTexto('');
      toast.success(`${novos.length} produto(s) adicionados — revise e salve`);
      buscarImagensAutomaticamente(novos);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao interpretar lista');
    }
    setParsing(false);
  };

  const buscarImagensAutomaticamente = async (items) => {
    let encontradas = 0;
    const fila = [...items];
    const workers = Array.from({ length: Math.min(4, fila.length) }, async () => {
      while (fila.length) {
        const item = fila.shift();
        if (!item?.product_name?.trim()) continue;
        try {
          const res = await vitrineService.sugerirImagem(item.product_name, item.ean);
          if (res.data.found && res.data.image_url) {
            encontradas += 1;
            setItens(prev => prev.map(it =>
              it._key === item._key
                ? { ...it, _imagePreview: vitrineService.imagemUrl(res.data.image_url), _imageUrl: res.data.image_url, _imageFile: null, _searching: false }
                : it
            ));
          } else {
            setItens(prev => prev.map(it => it._key === item._key ? { ...it, _searching: false } : it));
          }
        } catch {
          setItens(prev => prev.map(it => it._key === item._key ? { ...it, _searching: false } : it));
        }
      }
    });
    await Promise.all(workers);
    if (encontradas > 0) {
      toast.success(`${encontradas} foto(s) encontradas automaticamente`);
    }
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
    const fotosBuscando = itensAtivos.filter(it => it._searching).length;
    if (fotosBuscando > 0) {
      toast.info(`Aguarde: ainda estamos buscando foto para ${fotosBuscando} produto(s).`);
      return;
    }
    const semFoto = getItemsWithoutPhoto(itensAtivos);
    if (semFoto.length > 0) {
      const nomes = semFoto.slice(0, 3).map(it => it.product_name || 'Produto sem nome').join(', ');
      toast.warning(`${semFoto.length} produto(s) sem foto: ${nomes}. Clique em Foto ou envie uma imagem antes de salvar.`);
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

      const itensParaSalvar = itensAtivos.map((it, index) => buildBulkItemPayload(it, index));
      const bulkRes = await vitrineService.substituirItens(id, itensParaSalvar);
      const itensSalvos = bulkRes.data?.items || [];

      for (let index = 0; index < itensAtivos.length; index++) {
        const it = itensAtivos[index];
        const itemSalvo = itensSalvos[index];
        if (it._imageFile && itemSalvo?.id) {
          try { await vitrineService.uploadImagem(id, itemSalvo.id, it._imageFile); } catch {}
        }
      }

      toast.success('Vitrine atualizada!');
      navigate('/vitrine');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
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
          <button className="venpro-back-button" onClick={() => navigate('/vitrine')} title="Voltar" aria-label="Voltar">
            <ArrowLeft size={18} />
          </button>
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
              Produtos
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
                    onSearchImage={() => handleSearchImage(item._key, item.product_name, item.ean)}
                  />
                ))}
              </div>
            ) : (
              <div style={{ padding: '16px 0', color: '#6B6E74', fontSize: 13 }}>
                Nenhum produto. Adicione produtos abaixo.
              </div>
            )}

            <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="vt-btn-primary" onClick={() => setTabelaPickerAberto(true)}>
                <Table2 size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                Puxar da tabela
              </button>
              <button className="vt-btn-secondary" onClick={addItemManual}>
                <Plus size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                Adicionar produto
              </button>
            </div>

            {/* Adicionar via lista */}
            <div className="vt-paste-area" style={{ marginTop: 16 }}>
              <label className="vt-label">Adicionar mais produtos via lista</label>
              <textarea className="vt-input vt-textarea"
                placeholder={"SABAO PO ASSIM 800G R$ 5,90 UN CX 20UN\nOu lista compactada: PRODUTO CX-24 2,50 PRODUTO 2 CX-12 4,90"}
                value={listaTexto} onChange={e => setListaTexto(e.target.value)} rows={3} />
              <div style={{ marginTop: 10 }}>
                <button className="vt-btn-primary" onClick={parsearLista} disabled={parsing || !listaTexto.trim()}>
                  {parsing ? 'Interpretando...' : 'Interpretar e adicionar'}
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

            {imagePicker && (
              <ImagePickerModal
                picker={imagePicker}
                onClose={() => setImagePicker(null)}
                onSelect={selecionarImagem}
              />
            )}

            {tabelaPickerAberto && (
              <TabelaPickerModal
                onClose={() => setTabelaPickerAberto(false)}
                onAdd={adicionarDaTabela}
              />
            )}
          </div>

          {/* Ações */}
          <div className="vt-form-actions">
            <button className="vt-btn-secondary" onClick={() => navigate('/vitrine')}>
              Cancelar
            </button>
            <button className="vt-btn-primary" onClick={salvar} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar alterações'}
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
  const unitPrice = toNumber(item.price);
  const unitsPerPackage = item.units_per_package ? parseInt(item.units_per_package) || 0 : 0;
  const packagePrice = unitsPerPackage ? unitPrice * unitsPerPackage : unitPrice;

  return (
    <div className="vt-review-item">
      <div className="vt-review-item-header">
        <div className="vt-review-item-main">
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
              title="Pesquisar foto na internet"
              onClick={onSearchImage}
              disabled={item._searching}
              style={{ background: currentImg ? 'rgba(58,133,168,.15)' : '#363940', border: '1px solid #4A4D52', borderRadius: 6, cursor: 'pointer', color: currentImg ? '#3A85A8' : '#A0A3A8', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600 }}
            >
              {item._searching ? '...' : <><Search size={12} /> Pesquisar</>}
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
          <label>Preço unitário (R$)</label>
          <input type="number" step="0.01" value={item.price}
            onChange={e => onChange('price', e.target.value)} placeholder="0,00" />
        </div>
        <div className="vt-review-field">
          <label>Preço caixa</label>
          <div className="vt-calculated-price">
            {unitsPerPackage ? `R$ ${packagePrice.toFixed(2).replace('.', ',')}` : 'Informe qtd'}
          </div>
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

function ImagePickerModal({ picker, onClose, onSelect }) {
  return (
    <div className="vt-image-picker-overlay" onClick={onClose}>
      <div className="vt-image-picker" onClick={e => e.stopPropagation()}>
        <div className="vt-image-picker-header">
          <div>
            <div className="vt-image-picker-title">Pesquisar foto na internet</div>
            <div className="vt-image-picker-sub">{picker.productName}</div>
          </div>
          <button className="vt-btn-remove" onClick={onClose} title="Fechar">
            <X size={18} />
          </button>
        </div>

        {picker.loading ? (
          <div className="vt-image-picker-loading">Buscando opções de foto...</div>
        ) : (
          <div className="vt-image-picker-grid">
            {picker.images.map((img, i) => (
              <button
                key={`${img.image_url}-${i}`}
                className="vt-image-option"
                onClick={() => onSelect(img.image_url)}
              >
                <img src={img.thumbnail_url || img.image_url} alt="" />
                <span>Usar foto</span>
                {img.needs_review && <em>Conferir produto</em>}
                {(img.source || img.title) && (
                  <small>{img.source || img.title}</small>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
