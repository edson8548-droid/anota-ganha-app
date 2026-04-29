import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { vitrineService } from '../services/vitrine.service';
import './VitrinePublica.css';

const API_URL = 'https://api.venpro.com.br';

function imgUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${API_URL}${path}`;
}

function fmtMoeda(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

export default function VitrinePublica() {
  const { slug } = useParams();
  const [oferta, setOferta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [busca, setBusca] = useState('');
  const [categoriaSel, setCategoriaSel] = useState('all');
  const [quantidades, setQuantidades] = useState({});
  const [showCarrinho, setShowCarrinho] = useState(false);
  const [cliente, setCliente] = useState({ nome: '', empresa: '', cidade: '', obs: '' });
  const headerRef = useRef(null);

  useEffect(() => {
    vitrineService.obterPublica(slug)
      .then(res => setOferta(res.data))
      .catch(() => setErro('Vitrine não encontrada ou inativa.'))
      .finally(() => setLoading(false));
  }, [slug]);

  // Atualiza CSS variable para sticky search bar
  useEffect(() => {
    if (!headerRef.current) return;
    const obs = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--header-h', `${headerRef.current?.offsetHeight || 120}px`);
    });
    obs.observe(headerRef.current);
    return () => obs.disconnect();
  }, [oferta]);

  const categorias = useMemo(() => {
    if (!oferta) return [];
    const cats = [...new Set(oferta.items.map(i => i.category).filter(Boolean))];
    return cats;
  }, [oferta]);

  const itensFiltrados = useMemo(() => {
    if (!oferta) return [];
    return oferta.items.filter(item => {
      const matchBusca = !busca || item.product_name.toLowerCase().includes(busca.toLowerCase());
      const matchCat = categoriaSel === 'all' || item.category === categoriaSel;
      return matchBusca && matchCat;
    });
  }, [oferta, busca, categoriaSel]);

  const setQty = (id, valor) => {
    const v = Math.max(0, parseInt(valor) || 0);
    setQuantidades(prev => ({ ...prev, [id]: v }));
  };

  const incQty = (id) => setQty(id, (quantidades[id] || 0) + 1);
  const decQty = (id) => setQty(id, Math.max(0, (quantidades[id] || 0) - 1));

  const itensCarrinho = useMemo(() => {
    if (!oferta) return [];
    return oferta.items
      .filter(item => (quantidades[item.id] || 0) > 0)
      .map(item => ({ ...item, qty: quantidades[item.id], subtotal: item.price * quantidades[item.id] }));
  }, [oferta, quantidades]);

  const totalCarrinho = useMemo(() => itensCarrinho.reduce((s, i) => s + i.subtotal, 0), [itensCarrinho]);
  const qtdItens = useMemo(() => itensCarrinho.reduce((s, i) => s + i.qty, 0), [itensCarrinho]);

  const finalizarWhatsApp = () => {
    if (!cliente.nome.trim() || !cliente.empresa.trim() || !cliente.cidade.trim()) {
      alert('Preencha seu nome, empresa e cidade para finalizar o pedido.');
      return;
    }
    if (itensCarrinho.length === 0) return;

    const linhasItens = itensCarrinho.map((item, i) => {
      const unidade = item.units_per_package
        ? `${item.qty} ${item.unit} (cx ${item.units_per_package} un)`
        : `${item.qty} ${item.unit}`;
      return `${i + 1}. ${item.product_name}\nQtd: ${unidade}\nPreço: ${fmtMoeda(item.price)}\nSubtotal: ${fmtMoeda(item.subtotal)}`;
    }).join('\n\n');

    const msg = [
      `Olá, segue meu pedido:`,
      ``,
      `Oferta: ${oferta.title}`,
      `Cliente: ${cliente.nome}`,
      `Empresa/Mercado: ${cliente.empresa}`,
      `Cidade: ${cliente.cidade}`,
      ``,
      `Itens:`,
      ``,
      linhasItens,
      ``,
      `Total estimado: ${fmtMoeda(totalCarrinho)}`,
      cliente.obs ? `\nObservação:\n${cliente.obs}` : '',
    ].join('\n').trim();

    const numero = oferta.rca_whatsapp.replace(/\D/g, '');
    const url = `https://wa.me/55${numero}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // ── Loading / erro ───────────────────────────────────
  if (loading) return (
    <div className="vp-loading">
      <div style={{ fontSize: 32 }}>⏳</div>
      <span>Carregando vitrine...</span>
    </div>
  );

  if (erro) return (
    <div className="vp-error">
      <div style={{ fontSize: 40 }}>😕</div>
      <div style={{ fontWeight: 700 }}>Vitrine não encontrada</div>
      <div style={{ fontSize: 14 }}>{erro}</div>
    </div>
  );

  const vencida = oferta.expires_at && new Date(oferta.expires_at) < new Date();
  const abaixoMinimo = oferta.minimum_order_value && totalCarrinho < oferta.minimum_order_value && totalCarrinho > 0;

  return (
    <div className="vp-page">

      {/* ── Header ── */}
      <div className="vp-header" ref={headerRef}>
        <div className="vp-header-top">
          {oferta.company_logo_url
            ? <img className="vp-logo" src={imgUrl(oferta.company_logo_url)} alt={oferta.company_name} />
            : <div className="vp-logo-placeholder">{oferta.company_name[0]}</div>
          }
          <div className="vp-header-info">
            <div className="vp-company-name">{oferta.company_name}</div>
            <div className="vp-offer-title">{oferta.title}</div>
          </div>
        </div>

        <div className="vp-chips">
          {oferta.rca_name && (
            <span className="vp-chip">👤 {oferta.rca_name}</span>
          )}
          {oferta.expires_at && (
            <span className={`vp-chip ${vencida ? 'warn' : 'info'}`}>
              {vencida ? '⚠️ Oferta encerrada' : `📅 Válido até ${new Date(oferta.expires_at).toLocaleDateString('pt-BR')}`}
            </span>
          )}
          {oferta.minimum_order_value && (
            <span className="vp-chip">🛒 Mínimo {fmtMoeda(oferta.minimum_order_value)}</span>
          )}
          <span className="vp-chip">{oferta.items.length} produtos</span>
        </div>

        {oferta.notes && <div className="vp-notes">{oferta.notes}</div>}
      </div>

      {/* ── Busca + categorias ── */}
      <div className="vp-search-bar">
        <input
          className="vp-search-input"
          placeholder="Buscar produto..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        {categorias.length > 0 && (
          <div className="vp-cats">
            <button className={`vp-cat-btn ${categoriaSel === 'all' ? 'active' : ''}`}
              onClick={() => setCategoriaSel('all')}>Todos</button>
            {categorias.map(cat => (
              <button key={cat} className={`vp-cat-btn ${categoriaSel === cat ? 'active' : ''}`}
                onClick={() => setCategoriaSel(cat)}>{cat}</button>
            ))}
          </div>
        )}
      </div>

      {/* ── Produtos ── */}
      <div className="vp-products">
        {itensFiltrados.length === 0 ? (
          <div className="vp-no-products">Nenhum produto encontrado</div>
        ) : (
          itensFiltrados.map(item => {
            const qty = quantidades[item.id] || 0;
            const subtotal = item.price * qty;
            return (
              <div key={item.id} className={`vp-product-card ${qty > 0 ? 'has-qty' : ''}`}>
                {/* Imagem */}
                {imgUrl(item.image_url)
                  ? <img className="vp-product-img" src={imgUrl(item.image_url)} alt={item.product_name} loading="lazy" />
                  : <div className="vp-product-img-placeholder">🛒</div>
                }

                <div className="vp-product-info">
                  {item.ean && <div className="vp-product-code">{item.ean}</div>}
                  <div className="vp-product-name">{item.product_name}</div>

                  {item.units_per_package && (
                    <div className="vp-product-pkg">
                      {item.unit} · {item.units_per_package} un
                    </div>
                  )}

                  <div className="vp-product-price">{fmtMoeda(item.price)}</div>

                  {item.unit_price && (
                    <div className="vp-product-unit-price">
                      {fmtMoeda(item.unit_price)} / un
                    </div>
                  )}

                  {qty > 0 && (
                    <div className="vp-product-subtotal">= {fmtMoeda(subtotal)}</div>
                  )}

                  {/* Seletor de quantidade */}
                  <div className="vp-qty-control">
                    <button className="vp-qty-btn minus" onClick={() => decQty(item.id)}>−</button>
                    <input
                      className="vp-qty-input"
                      type="number"
                      min="0"
                      value={qty || ''}
                      placeholder="0"
                      onChange={e => setQty(item.id, e.target.value)}
                    />
                    <button className="vp-qty-btn plus" onClick={() => incQty(item.id)}>+</button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Footer carrinho ── */}
      <div className="vp-footer">
        <div className="vp-footer-inner">
          <div className="vp-footer-total">
            <span className="vp-footer-total-label">Total do pedido</span>
            <span className="vp-footer-total-value">{fmtMoeda(totalCarrinho)}</span>
          </div>
          <button
            className="vp-btn-cart"
            onClick={() => setShowCarrinho(true)}
            disabled={qtdItens === 0}
          >
            🛒 Ver carrinho
            {qtdItens > 0 && <span className="vp-cart-count">{qtdItens}</span>}
          </button>
        </div>
      </div>

      {/* ── Modal carrinho ── */}
      {showCarrinho && (
        <div className="vp-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowCarrinho(false); }}>
          <div className="vp-modal">
            <div className="vp-modal-handle" />
            <div className="vp-modal-title">Seu Pedido</div>

            {abaixoMinimo && (
              <div className="vp-min-warn">
                ⚠️ Pedido mínimo: {fmtMoeda(oferta.minimum_order_value)}.
                Seu pedido está em {fmtMoeda(totalCarrinho)}.
              </div>
            )}

            {/* Resumo */}
            {itensCarrinho.map(item => (
              <div key={item.id} className="vp-cart-item">
                <div>
                  <div className="vp-cart-item-name">{item.product_name}</div>
                  <div className="vp-cart-item-meta">
                    {item.qty} {item.unit}
                    {item.units_per_package ? ` (cx ${item.units_per_package} un)` : ''}
                    · {fmtMoeda(item.price)} cada
                  </div>
                </div>
                <div className="vp-cart-item-price">{fmtMoeda(item.subtotal)}</div>
              </div>
            ))}

            <div className="vp-cart-total">
              <span>Total</span>
              <span>{fmtMoeda(totalCarrinho)}</span>
            </div>

            {/* Dados do cliente */}
            <div className="vp-client-fields">
              <input className="vp-client-input" placeholder="Seu nome *"
                value={cliente.nome} onChange={e => setCliente(c => ({ ...c, nome: e.target.value }))} />
              <input className="vp-client-input" placeholder="Mercado / Empresa *"
                value={cliente.empresa} onChange={e => setCliente(c => ({ ...c, empresa: e.target.value }))} />
              <input className="vp-client-input" placeholder="Cidade *"
                value={cliente.cidade} onChange={e => setCliente(c => ({ ...c, cidade: e.target.value }))} />
              <textarea className="vp-client-input" placeholder="Observação (opcional)" rows={2}
                style={{ resize: 'vertical' }}
                value={cliente.obs} onChange={e => setCliente(c => ({ ...c, obs: e.target.value }))} />
            </div>

            <button className="vp-btn-whatsapp" onClick={finalizarWhatsApp}
              disabled={!cliente.nome.trim() || !cliente.empresa.trim() || !cliente.cidade.trim()}>
              📲 Enviar pedido pelo WhatsApp
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
