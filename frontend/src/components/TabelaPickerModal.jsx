import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { X, Search, Table2, ArrowLeft } from 'lucide-react';
import { vitrineService } from '../services/vitrine.service';

const MAX_VISIVEIS = 200;

const normalizar = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const fmtPreco = (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;

/**
 * Modal "Puxar da tabela": escolhe uma tabela enviada na Cotação Pronta,
 * o prazo de preço, marca os produtos e devolve os selecionados via onAdd.
 * onAdd recebe [{ nome, ean, preco, qtd_caixa }].
 */
export default function TabelaPickerModal({ onClose, onAdd }) {
  const [tabelas, setTabelas] = useState(null);       // null = carregando
  const [tabela, setTabela] = useState(null);          // tabela escolhida
  const [prazo, setPrazo] = useState(null);
  const [itens, setItens] = useState(null);            // null = ainda não carregou
  const [carregandoItens, setCarregandoItens] = useState(false);
  const [busca, setBusca] = useState('');
  const [selecionados, setSelecionados] = useState(() => new Set());
  const [limite, setLimite] = useState(MAX_VISIVEIS);

  useEffect(() => {
    let ativo = true;
    vitrineService.listarTabelas()
      .then(res => { if (ativo) setTabelas(res.data || []); })
      .catch(() => {
        toast.error('Erro ao carregar suas tabelas');
        if (ativo) setTabelas([]);
      });
    return () => { ativo = false; };
  }, []);

  const escolherTabela = (t) => {
    setTabela(t);
    const prazos = t.prazos_disponiveis || [];
    setPrazo(prazos.includes(7) ? 7 : prazos[0] ?? null);
    setItens(null);
    setBusca('');
    setSelecionados(new Set());
  };

  const carregarItens = async (t, p) => {
    setCarregandoItens(true);
    setItens(null);
    setSelecionados(new Set());
    setLimite(MAX_VISIVEIS);
    try {
      const res = await vitrineService.itensTabela(t.id, p);
      setItens(res.data.itens || []);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erro ao carregar produtos da tabela');
      setItens([]);
    }
    setCarregandoItens(false);
  };

  useEffect(() => {
    if (tabela && prazo != null) carregarItens(tabela, prazo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabela, prazo]);

  const filtrados = useMemo(() => {
    if (!itens) return [];
    const termo = normalizar(busca).trim();
    if (!termo) return itens.map((it, idx) => ({ ...it, _idx: idx }));
    const palavras = termo.split(/\s+/);
    return itens
      .map((it, idx) => ({ ...it, _idx: idx }))
      .filter(it => {
        const alvo = normalizar(it.nome) + ' ' + (it.ean || '');
        return palavras.every(p => alvo.includes(p));
      });
  }, [itens, busca]);

  const visiveis = filtrados.slice(0, limite);

  const carregarMaisAoRolar = (e) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300 && limite < filtrados.length) {
      setLimite(l => l + 300);
    }
  };

  const toggle = (idx) => {
    setSelecionados(prev => {
      const novo = new Set(prev);
      if (novo.has(idx)) novo.delete(idx); else novo.add(idx);
      return novo;
    });
  };

  const selecionarFiltrados = () => {
    setSelecionados(prev => {
      const novo = new Set(prev);
      filtrados.forEach(it => novo.add(it._idx));
      return novo;
    });
  };

  const limparSelecao = () => setSelecionados(new Set());

  const adicionar = () => {
    if (!selecionados.size) { toast.warning('Marque pelo menos um produto'); return; }
    const escolhidos = [...selecionados].sort((a, b) => a - b).map(idx => itens[idx]);
    onAdd(escolhidos, { tabela: tabela?.nome, prazo });
  };

  return (
    <div className="vt-image-picker-overlay" onClick={onClose}>
      <div className="vt-image-picker" onClick={e => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', maxHeight: '86vh', overflow: 'hidden' }}>

        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {tabela && (
              <button className="vt-btn-sm" onClick={() => { setTabela(null); setItens(null); setSelecionados(new Set()); }}
                title="Voltar para as tabelas" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ArrowLeft size={14} />
              </button>
            )}
            <div>
              <div style={{ fontSize: 15, fontWeight: 750, color: '#E1E1E1', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Table2 size={16} /> {tabela ? tabela.nome : 'Puxar produtos da tabela'}
              </div>
              <div style={{ fontSize: 12, color: '#A0A3A8', marginTop: 2 }}>
                {tabela
                  ? `${tabela.qtd_produtos} produtos na tabela`
                  : 'Tabelas que você enviou na Cotação Pronta'}
              </div>
            </div>
          </div>
          <button className="vt-btn-remove" onClick={onClose} title="Fechar">
            <X size={18} />
          </button>
        </div>

        {/* Passo 1: escolher tabela */}
        {!tabela && (
          <div style={{ overflow: 'auto' }}>
            {tabelas === null && (
              <div style={{ padding: '28px 0', textAlign: 'center', color: '#A0A3A8', fontSize: 13 }}>
                Carregando tabelas...
              </div>
            )}
            {tabelas !== null && tabelas.length === 0 && (
              <div style={{ padding: '28px 0', textAlign: 'center', color: '#A0A3A8', fontSize: 13 }}>
                Você ainda não enviou nenhuma tabela.<br />
                Envie a planilha do atacado na <strong>Cotação Pronta</strong> e ela aparece aqui.
              </div>
            )}
            {(tabelas || []).map(t => (
              <button key={t.id} onClick={() => escolherTabela(t)}
                style={{
                  width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 8,
                  background: '#363940', border: '1px solid #4A4D52', borderRadius: 10,
                  padding: '12px 14px', color: '#E1E1E1',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{t.nome}</span>
                <span style={{ fontSize: 12, color: '#A0A3A8', whiteSpace: 'nowrap' }}>
                  {t.qtd_produtos} produtos
                  {t.data_upload ? ` · ${new Date(t.data_upload).toLocaleDateString('pt-BR')}` : ''}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Passo 2: prazo + busca + itens */}
        {tabela && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: '#A0A3A8' }}>Prazo:</span>
              {(tabela.prazos_disponiveis || []).map(p => (
                <button key={p} onClick={() => setPrazo(p)}
                  style={{
                    cursor: 'pointer', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700,
                    background: p === prazo ? '#3A85A8' : 'transparent',
                    border: `1px solid ${p === prazo ? '#3A85A8' : '#4A4D52'}`,
                    color: p === prazo ? '#fff' : '#A0A3A8',
                  }}>
                  {p} dias
                </button>
              ))}
            </div>

            <div style={{ position: 'relative', marginBottom: 10 }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#6B6E74' }} />
              <input className="vt-input" style={{ paddingLeft: 36 }}
                placeholder="Buscar por nome ou EAN..."
                value={busca} onChange={e => { setBusca(e.target.value); setLimite(MAX_VISIVEIS); }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, fontSize: 12, color: '#A0A3A8' }}>
              <span>
                {carregandoItens
                  ? 'Carregando produtos...'
                  : `${filtrados.length} produto${filtrados.length !== 1 ? 's' : ''}${limite < filtrados.length ? ` — mostrando ${visiveis.length}, role para ver mais` : ''}`}
              </span>
              <span style={{ display: 'flex', gap: 10 }}>
                <button onClick={selecionarFiltrados} disabled={carregandoItens || !filtrados.length}
                  style={{ background: 'none', border: 'none', color: '#3A85A8', cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: 0 }}>
                  Marcar filtrados
                </button>
                <button onClick={limparSelecao} disabled={!selecionados.size}
                  style={{ background: 'none', border: 'none', color: selecionados.size ? '#A0A3A8' : '#4A4D52', cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: 0 }}>
                  Limpar
                </button>
              </span>
            </div>

            <div onScroll={carregarMaisAoRolar}
              style={{ flex: 1, overflow: 'auto', border: '1px solid #4A4D52', borderRadius: 10, minHeight: 120 }}>
              {visiveis.map(it => {
                const marcado = selecionados.has(it._idx);
                return (
                  <label key={it._idx}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                      padding: '9px 12px', borderBottom: '1px solid #363940',
                      background: marcado ? 'rgba(58,133,168,.12)' : 'transparent',
                    }}>
                    <input type="checkbox" checked={marcado} onChange={() => toggle(it._idx)}
                      style={{ accentColor: '#3A85A8', width: 15, height: 15, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, color: '#E1E1E1', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.nome}
                    </span>
                    {it.qtd_caixa ? (
                      <span style={{ fontSize: 11, color: '#A0A3A8', background: '#363940', borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                        cx {it.qtd_caixa}
                      </span>
                    ) : null}
                    <span style={{ fontSize: 13, fontWeight: 750, color: '#7BC47F', whiteSpace: 'nowrap' }}>
                      {fmtPreco(it.preco)}
                    </span>
                  </label>
                );
              })}
              {!carregandoItens && itens && !visiveis.length && (
                <div style={{ padding: '24px 0', textAlign: 'center', color: '#6B6E74', fontSize: 13 }}>
                  Nenhum produto encontrado.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 }}>
              <span style={{ fontSize: 12, color: '#A0A3A8' }}>
                {selecionados.size} selecionado{selecionados.size !== 1 ? 's' : ''}
              </span>
              <button className="vt-btn-primary" onClick={adicionar} disabled={!selecionados.size}>
                Adicionar {selecionados.size || ''} à vitrine
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
