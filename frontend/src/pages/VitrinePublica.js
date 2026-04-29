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

function orderKey(slug) {
  return `vitrine_pedido_${slug}`;
}

function salvarPedido(slug, quantidades, cliente) {
  const data = { quantidades, cliente, salvoEm: new Date().toISOString() };
  try { localStorage.setItem(orderKey(slug), JSON.stringify(data)); } catch {}
}

function carregarPedido(slug) {
  try {
    const raw = localStorage.getItem(orderKey(slug));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function limparPedido(slug) {
  try { localStorage.removeItem(orderKey(slug)); } catch {}
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
  const [pedidoAnterior, setPedidoAnterior] = useState(null);
  const headerRef = useRef(null);

  useEffect(() => {
    vitrineService.obterPublica(slug)
      .then(res => setOferta(res.data))
      .catch(() => setErro('Vitrine não encontrada ou inativa.'))
      .finally(() => setLoading(false));
  }, [slug]);

  // Restaurar pedido salvo ao carregar
  useEffect(() => {
    if (!oferta) return;
    const saved = carregarPedido(slug);
    if (saved && saved.quantidades) {
      // Só restaura itens que ainda existem na oferta
      const idsValidos = new Set(oferta.items.map(i => i.id));
      const qtsValidas = {};
      for (const [id, qty] of Object.entries(saved.quantidades)) {
        if (idsValidos.has(id) && qty > 0) qtsValidas[id] = qty;
      }
      if (Object.keys(qtsValidas).length > 0) {
        setPedidoAnterior({ quantidades: qtsValidas, cliente: saved.cliente || {} });
      }
    }
  }, [oferta, slug]);

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

  const restaurarPedido = () => {
    if (!pedidoAnterior) return;
    setQuantidades(pedidoAnterior.quantidades);
    if (pedidoAnterior.cliente) setCliente(pedidoAnterior.cliente);
    setPedidoAnterior(null);
  };

  const descartarPedido = () => {
    limparPedido(slug);
    setPedidoAnterior(null);
  };

  const finalizarWhatsApp = () => {
    if (itensCarrinho.length === 0) return;

    // Salvar pedido antes de enviar
    salvarPedido(slug, quantidades, cliente);

    const linhasItens = itensCarrinho.map((item, i) => {
      const unidade = item.units_per_package
        ? `${item.qty} ${item.unit} (cx ${item.units_per_package} un)`
        : `${item.qty} ${item.unit}`;
      const precoUn = item.unit_price ? `\nPreço un: ${fmtMoeda(item.unit_price)}` : '';
      return `${i + 1}. ${item.product_name}\nQtd: ${unidade}\nPreço: ${fmtMoeda(item.price)}${precoUn}\nSubtotal: ${fmtMoeda(item.subtotal)}`;
    }).join('\n\n');

    const linhasCliente = [
      cliente.nome.trim()    ? `Cliente: ${cliente.nome.trim()}`            : '',
      cliente.empresa.trim() ? `Empresa/Mercado: ${cliente.empresa.trim()}` : '',
      cliente.cidade.trim()  ? `Cidade: ${cliente.cidade.trim()}`           : '',
    ].filter(Boolean);

    const msg = [
      `Olá, segue meu pedido:`,
      ``,
      `Oferta: ${oferta.title}`,
      ...linhasCliente,
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

    setShowCarrinho(false);
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
  const abaixoMinimo = oferta.minimum_order_value && totalCarrinho > 0 && totalCarrinho < oferta.minimum_order_value;
  const faltaMinimo = abaixoMinimo ? oferta.minimum_order_value - totalCarrinho : 0;
  const temCarrinho = qtdItens > 0;

  return (
    <div className="vp-page">

      {/* ── Banner pedido anterior ── */}
      {pedidoAnterior && !temCarrinho && (
        <div className="vp-restore-banner">
          <div className="vp-restore-text">
            Você tem um pedido anterior salvo.
            Deseja continuar de onde parou?
          </div>
          <div className="vp-restore-actions">
            <button className="vp-restore-btn primary" onClick={restaurarPedido}>
              Sim, restaurar pedido
            </button>
            <button className="vp-restore-btn" onClick={descartarPedido}>
              Novo pedido
            </button>
          </div>
        </div>
      )}

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

                  {item.unit_price && (
                    <div className="vp-product-unit-price">
                      {fmtMoeda(item.unit_price)} / un
                    </div>
                  )}

                  <div className="vp-product-price">
                    {fmtMoeda(item.price)}
                    {item.units_per_package ? ` / ${item.unit}` : ''}
                  </div>

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

            <div className="vp-modal-header">
              <button className="vp-btn-voltar" onClick={() => setShowCarrinho(false)}>
                ← Voltar aos produtos
              </button>
              <div className="vp-modal-title">Seu Pedido</div>
            </div>

            {abaixoMinimo && (
              <div className="vp-min-warn">
                ⚠️ Faltam <strong>{fmtMoeda(faltaMinimo)}</strong> para o pedido mínimo de {fmtMoeda(oferta.minimum_order_value)}.
                Adicione mais produtos para continuar.
              </div>
            )}

            {itensCarrinho.length === 0 ? (
              <div className="vp-cart-empty">
                Nenhum produto adicionado ainda.
                Volte e adicione produtos ao pedido.
              </div>
            ) : (
              <>
                {/* Resumo */}
                {itensCarrinho.map(item => (
                  <div key={item.id} className="vp-cart-item">
                    <div>
                      <div className="vp-cart-item-name">{item.product_name}</div>
                      <div className="vp-cart-item-meta">
                        {item.qty} {item.unit}
                        {item.units_per_package ? ` (cx ${item.units_per_package} un)` : ''}
                        {' · '}{fmtMoeda(item.price)}{item.unit_price ? ` (un ${fmtMoeda(item.unit_price)})` : ''}
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
                  <input className="vp-client-input" placeholder="Seu nome (opcional)"
                    value={cliente.nome} onChange={e => setCliente(c => ({ ...c, nome: e.target.value }))} />
                  <input className="vp-client-input" placeholder="Mercado / Empresa (opcional)"
                    value={cliente.empresa} onChange={e => setCliente(c => ({ ...c, empresa: e.target.value }))} />
                  <input className="vp-client-input" placeholder="Cidade (opcional)"
                    value={cliente.cidade} onChange={e => setCliente(c => ({ ...c, cidade: e.target.value }))} />
                  <textarea className="vp-client-input" placeholder="Observação (opcional)" rows={2}
                    style={{ resize: 'vertical' }}
                    value={cliente.obs} onChange={e => setCliente(c => ({ ...c, obs: e.target.value }))} />
                </div>

                <button className="vp-btn-whatsapp" onClick={finalizarWhatsApp}
                  disabled={itensCarrinho.length === 0 || abaixoMinimo}>
                  📲 Enviar pedido pelo WhatsApp
                </button>

                <div className="vp-save-hint">
                  Seu pedido será salvo automaticamente. Se clicar neste link novamente,
                  poderá editar e adicionar mais itens.
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
