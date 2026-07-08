import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Store, Plus, Pencil, Trash2, Copy, Eye, X, Check, Image, Search, Table2 } from 'lucide-react';
import { vitrineService } from '../services/vitrine.service';
import TabelaPickerModal from '../components/TabelaPickerModal';
import './Vitrine.css';

const UNIDADES = ['UN', 'CX', 'FD', 'PC', 'PCT', 'KG', 'L', 'ML', 'G', 'FRD', 'BAG'];
const MAX_VITRINES = 4;

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
    product_code: it.product_code || null,
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

const getItemsWithoutPhoto = (items) => items.filter(it =>
  !it._imageFile && !(it._imagePreview || it._imageUrl || it.image_url)
);

const getApiErrorMessage = (err, fallback) =>
  err?.response?.data?.detail ||
  (err?.message === 'Network Error'
    ? 'Falha de conexão com a API. Feche a aba/app, abra novamente e tente excluir outra vez.'
    : err?.message) ||
  fallback;

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
  const [imagePicker, setImagePicker] = useState(null);
  const [tabelaPickerAberto, setTabelaPickerAberto] = useState(false);

  const logoInputRef = useRef(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await vitrineService.listar();
      setOfertas(res.data.filter(o => o.status !== 'deleted'));
    } catch (err) {
      console.error('[Vitrine] Erro ao carregar vitrines:', err);
      toast.error(getApiErrorMessage(err, 'Erro ao carregar vitrines'));
    }
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Copiar link ──────────────────────────────────────
  const copiarLink = (oferta) => {
    const link = vitrineService.gerarLinkPublico(oferta.slug, oferta.company_name);
    navigator.clipboard.writeText(link);
    setCopiedSlug(oferta.slug);
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
    } catch (err) {
      console.error('[Vitrine] Erro ao alterar status:', err);
      toast.error(getApiErrorMessage(err, 'Erro ao alterar status'));
    }
  };

  // ── Excluir ──────────────────────────────────────────
  const excluir = async (id) => {
    if (!window.confirm('Excluir esta vitrine? Esta ação não pode ser desfeita.')) return;
    let toastAguardando = null;
    try {
      await vitrineService.excluir(id, {
        onAguardandoServidor: () => {
          toastAguardando = toast.loading('Servidor hibernado, aguardando reconexão... (pode levar até 60s)');
        },
      });
      if (toastAguardando) toast.dismiss(toastAguardando);
      setOfertas(prev => prev.filter(oferta => oferta._id !== id));
      toast.success('Vitrine excluída');
      carregar();
    } catch (err) {
      if (toastAguardando) toast.dismiss(toastAguardando);
      console.error('[Vitrine] Erro ao excluir:', err);
      toast.error(getApiErrorMessage(err, 'Erro ao excluir'));
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
        _searching: true,
        price: String(item.unit_price ?? item.price ?? ''),
        units_per_package: item.units_per_package ? String(item.units_per_package) : '',
      }));
      setItensParsed(items);
      toast.success(`${items.length} produtos interpretados — revise e ajuste`);
      buscarImagensAutomaticamente(items, setItensParsed);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao interpretar lista');
    }
    setParsing(false);
  };

  const buscarImagensAutomaticamente = async (items, setItems) => {
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
            setItems(prev => prev.map(it =>
              it._key === item._key
                ? { ...it, _imagePreview: vitrineService.imagemUrl(res.data.image_url), _imageUrl: res.data.image_url, _imageFile: null, _searching: false }
                : it
            ));
          } else {
            setItems(prev => prev.map(it => it._key === item._key ? { ...it, _searching: false } : it));
          }
        } catch {
          setItems(prev => prev.map(it => it._key === item._key ? { ...it, _searching: false } : it));
        }
      }
    });
    await Promise.all(workers);
    if (encontradas > 0) {
      toast.success(`${encontradas} foto(s) encontradas automaticamente`);
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
      _imagePreview: p.foto_url || null,
      _imageUrl: p.foto_url || null,
      _searching: !p.foto_url,
    }));
    setItensParsed(prev => [...prev, ...novos]);
    setTabelaPickerAberto(false);
    const comFotoBanco = novos.filter(n => n._imageUrl).length;
    toast.success(`${novos.length} produto(s) adicionados${comFotoBanco ? ` (${comFotoBanco} com foto do banco)` : ''} — revise e ajuste`);
    buscarImagensAutomaticamente(novos.filter(n => !n._imageUrl), setItensParsed);
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
    const selectedItem = itensParsed.find(it => it._key === imagePicker.key);
    setItensParsed(prev => prev.map(it =>
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
        setItensParsed(prev => prev.map(it =>
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
    const fotosBuscando = itensParsed.filter(it => it._searching).length;
    if (fotosBuscando > 0) {
      toast.info(`Aguarde: ainda estamos buscando foto para ${fotosBuscando} produto(s).`);
      return;
    }
    const semFoto = getItemsWithoutPhoto(itensParsed);
    if (semFoto.length > 0) {
      const nomes = semFoto.slice(0, 3).map(it => it.product_name || 'Produto sem nome').join(', ');
      toast.warning(`${semFoto.length} produto(s) sem foto: ${nomes}. Clique em Foto ou envie uma imagem antes de salvar.`);
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
        items: itensParsed.map((it, i) => buildItemPayload(it, i)),
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
          <button className="venpro-back-button" onClick={() => navigate('/dashboard')} title="Voltar" aria-label="Voltar">
            <ArrowLeft size={18} />
          </button>
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
            <div className="vt-list-sub">{ofertas.length}/{MAX_VITRINES} vitrines criadas</div>
          </div>
          <button
            className="vt-btn-new"
            onClick={() => setView('nova')}
            disabled={ofertas.length >= MAX_VITRINES}
          >
            <Plus size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Nova Vitrine
          </button>
        </div>

        {ofertas.length >= MAX_VITRINES && (
          <div className="vt-limit-info">
            ℹ️ Você atingiu o limite de {MAX_VITRINES} vitrines. Exclua uma para criar outra.
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
                  {vitrineService.gerarLinkPublico(oferta.slug, oferta.company_name)}
                </div>
                <button className="vt-btn-sm" title="Copiar link" onClick={() => copiarLink(oferta)}>
                  {copiedSlug === oferta.slug ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button className="vt-btn-sm" title="Ver vitrine" onClick={() => window.open(vitrineService.gerarLinkPublico(oferta.slug, oferta.company_name), '_blank')}>
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
          <button className="venpro-back-button" onClick={() => { resetForm(); setView('lista'); }} title="Voltar" aria-label="Voltar">
            <ArrowLeft size={18} />
          </button>
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
            <div className="vt-form-section-title">Produtos</div>

            {/* Cole lista */}
            <div className="vt-paste-area">
              <label className="vt-label">Cole sua lista de produtos</label>
              <textarea className="vt-input vt-textarea"
                placeholder={"AGUA SANITARIA YPE 2L R$ 8,54 UN CX 8UN\nLAVA ROUPA PO ASSIM 800G R$ 119,00 CX 20UN\nOu lista compactada: PRODUTO CX-24 2,50 PRODUTO 2 CX-12 4,90"}
                value={listaTexto} onChange={e => setListaTexto(e.target.value)} rows={5} />
              <div className="vt-paste-hint">
                Cole uma linha por produto ou uma lista compactada de IA/PDF. O sistema interpreta nome, preço, unidade e quantidade por embalagem.
              </div>
              <div style={{ display:'flex', gap:10, marginTop:12, flexWrap:'wrap' }}>
                <button className="vt-btn-primary" onClick={() => setTabelaPickerAberto(true)}>
                  <Table2 size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  Puxar da tabela
                </button>
                <button className="vt-btn-primary" onClick={parsearLista} disabled={parsing || !listaTexto.trim()}>
                  {parsing ? 'Interpretando...' : 'Interpretar lista'}
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
                      onSearchImage={() => handleSearchImage(item._key, item.product_name, item.ean)}
                    />
                  ))}
                </div>
                <button className="vt-btn-secondary" style={{ marginTop:12 }} onClick={addItemManual}>
                  + Adicionar produto
                </button>
              </>
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
            <button className="vt-btn-secondary" onClick={() => { resetForm(); setView('lista'); }}>
              Cancelar
            </button>
            <button className="vt-btn-primary" onClick={salvarOferta} disabled={saving}>
              {saving ? 'Salvando...' : 'Criar vitrine de ofertas'}
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
  const unitPrice = toNumber(item.price);
  const unitsPerPackage = item.units_per_package ? parseInt(item.units_per_package) || 0 : 0;
  const packagePrice = unitsPerPackage ? unitPrice * unitsPerPackage : unitPrice;

  return (
    <div className="vt-review-item">
      <div className="vt-review-item-header">
        <div className="vt-review-item-main">
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
              title="Pesquisar foto na internet"
              onClick={onSearchImage}
              disabled={item._searching}
              style={{ background: item._imagePreview ? 'rgba(58,133,168,.15)' : '#363940', border: '1px solid #4A4D52', borderRadius: 6, cursor:'pointer', color: item._imagePreview ? '#3A85A8' : '#A0A3A8', padding:'4px 8px', display:'flex', alignItems:'center', gap: 4, fontSize: 11, fontWeight: 600 }}
            >
              {item._searching ? '...' : <><Search size={12} /> Pesquisar</>}
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
