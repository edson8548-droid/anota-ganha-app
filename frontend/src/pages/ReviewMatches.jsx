import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const BADGE = {
  EAN:       { bg: '#14532d', color: '#4ade80', label: 'EAN 100% acerto' },
  APRENDIDO: { bg: '#1e3a5f', color: '#60a5fa', label: 'Aprendido' },
  manual:    { bg: '#3f2f05', color: '#facc15', label: 'Preço manual' },
  pendente:  { bg: '#431407', color: '#fb923c', label: 'Aguarda revisão' },
  sem_match: { bg: '#1e293b', color: '#64748b', label: 'Não encontrado' },
};

function badgeInfo(item) {
  if (item.status === 'aprovado' && item.tipo === 'EAN')       return BADGE.EAN;
  if (item.status === 'aprovado' && item.tipo === 'APRENDIDO') return BADGE.APRENDIDO;
  if (item.status === 'pendente')                               return BADGE.pendente;
  return BADGE.sem_match;
}

function formatPrice(value) {
  if (value == null || value === '') return '';
  const numero = Number(value);
  if (!Number.isFinite(numero)) return '';
  return numero.toFixed(2).replace('.', ',');
}

function parsePrice(value) {
  let cleaned = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .trim();
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  }
  const numero = Number(cleaned);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function parsePercent(value) {
  if (value === '') return null;
  const numero = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(numero) && numero > -100 && numero < 100 ? numero : null;
}

export default function ReviewMatches({ itens, onConfirmar, confirmando }) {
  const [aprovacoes, setAprovacoes] = useState(() =>
    itens.map(it => it.status === 'aprovado')
  );
  const [precos, setPrecos] = useState(() =>
    itens.map(it => formatPrice(it.preco))
  );
  const [percentuaisItens, setPercentuaisItens] = useState(() => itens.map(() => '0'));
  const [basesPercentuaisItens, setBasesPercentuaisItens] = useState(() => itens.map(() => null));
  const [ajustePercentual, setAjustePercentual] = useState('');

  const toggle = (idx) =>
    setAprovacoes(prev => prev.map((v, i) => i === idx ? !v : v));

  const updatePreco = (idx, value) => {
    setPrecos(prev => prev.map((v, i) => i === idx ? value : v));
    setPercentuaisItens(prev => prev.map((v, i) => i === idx ? '0' : v));
    setBasesPercentuaisItens(prev => prev.map((v, i) => i === idx ? null : v));
  };

  const updatePercentualItem = (idx, value) => {
    const pct = parsePercent(value);
    const baseExistente = basesPercentuaisItens[idx];
    const base = baseExistente ?? parsePrice(precos[idx]) ?? parsePrice(formatPrice(itens[idx]?.preco));

    setPercentuaisItens(prev => prev.map((v, i) => i === idx ? value : v));

    if (pct == null || base == null) {
      if ((value === '' || value === '0') && baseExistente != null) {
        setPrecos(prev => prev.map((preco, i) => i === idx ? formatPrice(baseExistente) : preco));
        setBasesPercentuaisItens(prev => prev.map((v, i) => i === idx ? null : v));
      }
      return;
    }

    if (pct === 0) {
      if (baseExistente != null) {
        setPrecos(prev => prev.map((preco, i) => i === idx ? formatPrice(baseExistente) : preco));
        setBasesPercentuaisItens(prev => prev.map((v, i) => i === idx ? null : v));
      }
      return;
    }

    const fator = 1 + (pct / 100);
    const novo = Math.round((base * fator) * 100) / 100;
    setPrecos(prev => prev.map((valor, i) => i === idx ? formatPrice(novo) : valor));
    if (baseExistente == null) {
      setBasesPercentuaisItens(prev => prev.map((v, i) => i === idx ? base : v));
    }
  };

  const stepPercentualItem = (idx, delta) => {
    const atual = parsePercent(percentuaisItens[idx]) ?? 0;
    const proximo = Math.max(-99, Math.min(99, atual + delta));
    updatePercentualItem(idx, String(proximo));
  };

  const aplicarPercentual = () => {
    const pct = Number(String(ajustePercentual).replace(',', '.'));
    if (!Number.isFinite(pct) || pct === 0) return;
    const fator = 1 + (pct / 100);
    setPrecos(prev => prev.map((valor, idx) => {
      if (!aprovacoes[idx]) return valor;
      const atual = parsePrice(valor);
      if (atual == null) return valor;
      const novo = Math.round((atual * fator) * 100) / 100;
      return formatPrice(novo);
    }));
    setPercentuaisItens(itens.map(() => '0'));
    setBasesPercentuaisItens(itens.map(() => null));
  };

  const aprovados = aprovacoes.filter(Boolean).length;
  const total = itens.length;
  const precosEditados = precos.map((value, idx) => {
    return parsePrice(value);
  });
  const temPrecoInvalido = itens.some((item, idx) =>
    aprovacoes[idx] && precosEditados[idx] == null
  );

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 16,
      }}>
        <div>
          <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 16 }}>
            Revisar preenchimento
          </div>
          <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 2 }}>
            {aprovados} de {total} itens aprovados
          </div>
        </div>
        <button
          onClick={() => onConfirmar(aprovacoes, precosEditados)}
          disabled={confirmando || aprovados === 0 || temPrecoInvalido}
          style={{
            background: (confirmando || temPrecoInvalido) ? '#374151' : '#e8412a',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '10px 20px',
            fontWeight: 700,
            fontSize: 14,
            cursor: (confirmando || temPrecoInvalido) ? 'not-allowed' : 'pointer',
          }}
        >
          {confirmando ? 'Gerando Excel...' : `Confirmar e Baixar (${aprovados})`}
        </button>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
        flexWrap: 'wrap',
      }}>
        <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 700 }}>
          Ajuste em lote (%):
        </span>
        <input
          value={ajustePercentual}
          onChange={(e) => setAjustePercentual(e.target.value)}
          inputMode="decimal"
          placeholder="-3 ou 3"
          style={{
            width: 96,
            background: '#0f172a',
            border: '1px solid #334155',
            color: '#f8fafc',
            borderRadius: 6,
            padding: '6px 8px',
            fontSize: 13,
            fontWeight: 700,
          }}
        />
        <button
          onClick={aplicarPercentual}
          style={{
            background: '#334155',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Aplicar nos aprovados
        </button>
      </div>

      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        {itens.map((item, idx) => {
          const badge = badgeInfo(item);
          const aprovado = aprovacoes[idx];
          const automaticoConfiavel = item.status === 'aprovado' && item.tipo === 'EAN';
          const precoAtual = precosEditados[idx];
          const semMatchComPrecoManual = item.status === 'sem_match' && precoAtual != null;
          const podeToggle = item.status === 'pendente'
            || (item.status === 'aprovado')
            || semMatchComPrecoManual
            || (item.status === 'sem_match' && aprovado);
          const precoEditavel = true;
          const precoOriginal = Number(item.preco);
          const precoAlterado = precoEditavel && precoAtual != null && (
            item.preco == null || Math.abs(precoAtual - precoOriginal) >= 0.005
          );
          const precoInvalido = aprovado && precoEditavel && precoAtual == null;
          const badgeAtual = semMatchComPrecoManual ? BADGE.manual : badge;

          return (
            <div key={idx} style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              background: aprovado ? '#0f2d1a' : '#1e293b',
              borderRadius: 8,
              padding: '10px 14px',
              border: `1px solid ${aprovado ? '#166534' : '#334155'}`,
              opacity: item.status === 'sem_match' && !semMatchComPrecoManual ? 0.72 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minWidth: 0 }}>
                <span style={{
                  background: badgeAtual.bg, color: badgeAtual.color,
                  borderRadius: 4, padding: '2px 8px', fontSize: 11,
                  fontWeight: 700, whiteSpace: 'nowrap', minWidth: 80, textAlign: 'center',
                }}>
                  {item.tipo && item.status === 'pendente' ? item.tipo : badgeAtual.label}
                </span>

                <div style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                }}>
                  <span style={{
                    color: '#f1f5f9',
                    fontSize: 13,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {item.nome_cotacao}
                  </span>
                  {item.ean ? (
                    <span style={{
                      color: aprovado ? '#86efac' : '#94a3b8',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      Código de barras: {item.ean}
                    </span>
                  ) : (
                    <span style={{
                      color: '#64748b',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0,
                    }}>
                      Sem código de barras lido
                    </span>
                  )}
                </div>

                {automaticoConfiavel && item.preco && (
                  <span style={{
                    color: precoAlterado ? '#f59e0b' : '#4ade80',
                    fontSize: 12,
                    fontWeight: 800,
                    minWidth: 96,
                    textAlign: 'right',
                    whiteSpace: 'nowrap',
                  }}>
                    {precoAlterado ? 'Preço alterado' : 'Automático'}
                  </span>
                )}
              </div>

              {precoEditavel ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  justifyContent: 'flex-end',
                  flexWrap: 'wrap',
                }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    justifyContent: 'flex-end',
                  }}>
                    <span style={{ color: precoInvalido ? '#f87171' : '#4ade80', fontSize: 12, fontWeight: 800 }}>R$</span>
                    <input
                      value={precos[idx]}
                      onChange={(e) => updatePreco(idx, e.target.value)}
                      inputMode="decimal"
                      placeholder="0,00"
                      aria-label={`Preço de ${item.nome_cotacao}`}
                      style={{
                        width: 72,
                        background: '#0f172a',
                        border: `1px solid ${precoInvalido ? '#ef4444' : precoAlterado ? '#f59e0b' : '#334155'}`,
                        color: precoInvalido ? '#f87171' : '#f8fafc',
                        borderRadius: 6,
                        padding: '5px 7px',
                        fontSize: 13,
                        fontWeight: 800,
                        textAlign: 'right',
                      }}
                    />
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    background: '#1f2937',
                    border: `1px solid ${
                      parsePercent(percentuaisItens[idx]) > 0
                        ? '#166534'
                        : parsePercent(percentuaisItens[idx]) < 0
                          ? '#7f1d1d'
                          : '#334155'
                    }`,
                    borderRadius: 6,
                    padding: '2px 4px',
                  }}>
                    <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap' }}>%</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={percentuaisItens[idx]}
                      onChange={(e) => updatePercentualItem(idx, e.target.value)}
                      onBlur={(e) => {
                        if (e.target.value === '') updatePercentualItem(idx, '0');
                      }}
                      aria-label={`Ajuste percentual de ${item.nome_cotacao}`}
                      title="Seta para cima aumenta; seta para baixo dá desconto"
                      style={{
                        width: 30,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        color: parsePercent(percentuaisItens[idx]) > 0
                          ? '#86efac'
                          : parsePercent(percentuaisItens[idx]) < 0
                            ? '#fca5a5'
                            : '#f8fafc',
                        fontSize: 12,
                        fontWeight: 900,
                        textAlign: 'right',
                      }}
                    />
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                    }}>
                      <button
                        type="button"
                        onClick={() => stepPercentualItem(idx, 1)}
                        aria-label={`Aumentar percentual de ${item.nome_cotacao}`}
                        title="Aumentar 1%"
                        style={{
                          width: 16,
                          height: 12,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: '#166534',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          padding: 0,
                          cursor: 'pointer',
                        }}
                      >
                        <ChevronUp size={10} strokeWidth={3} />
                      </button>
                      <button
                        type="button"
                        onClick={() => stepPercentualItem(idx, -1)}
                        aria-label={`Diminuir percentual de ${item.nome_cotacao}`}
                        title="Diminuir 1%"
                        style={{
                          width: 16,
                          height: 12,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: '#7f1d1d',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          padding: 0,
                          cursor: 'pointer',
                        }}
                      >
                        <ChevronDown size={10} strokeWidth={3} />
                      </button>
                    </div>
                  </label>

                  {podeToggle && (
                    <button
                      onClick={() => toggle(idx)}
                      disabled={!aprovado && precoAtual == null}
                      style={{
                        background: (!aprovado && precoAtual == null) ? '#475569' : aprovado ? '#ef4444' : '#16a34a',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        padding: '5px 12px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: (!aprovado && precoAtual == null) ? 'not-allowed' : 'pointer',
                        minWidth: 70,
                      }}
                    >
                      {aprovado ? 'Rejeitar' : 'Aprovar'}
                    </button>
                  )}
                </div>
              ) : (
                <span style={{
                  color: '#64748b',
                  fontSize: 13,
                  fontWeight: 700,
                  minWidth: 70,
                  textAlign: 'right',
                }}>
                  —
                </span>
              )}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
