import React, { useState } from 'react';

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

export default function ReviewMatches({ itens, onConfirmar, confirmando }) {
  const [aprovacoes, setAprovacoes] = useState(() =>
    itens.map(it => it.status === 'aprovado')
  );
  const [precos, setPrecos] = useState(() =>
    itens.map(it => formatPrice(it.preco))
  );

  const toggle = (idx) =>
    setAprovacoes(prev => prev.map((v, i) => i === idx ? !v : v));

  const updatePreco = (idx, value) =>
    setPrecos(prev => prev.map((v, i) => i === idx ? value : v));

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

      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 400 }}>
        {itens.map((item, idx) => {
          const badge = badgeInfo(item);
          const aprovado = aprovacoes[idx];
          const automaticoConfiavel = item.status === 'aprovado' && item.tipo === 'EAN';
          const precoAtual = precosEditados[idx];
          const semMatchComPrecoManual = item.status === 'sem_match' && precoAtual != null;
          const podeToggle = item.status === 'pendente'
            || (item.status === 'aprovado' && item.tipo !== 'EAN')
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
              display: 'flex', alignItems: 'center', gap: 10,
              background: aprovado ? '#0f2d1a' : '#1e293b',
              borderRadius: 8,
              padding: '10px 14px',
              border: `1px solid ${aprovado ? '#166534' : '#334155'}`,
              opacity: item.status === 'sem_match' && !semMatchComPrecoManual ? 0.72 : 1,
            }}>
              <span style={{
                background: badgeAtual.bg, color: badgeAtual.color,
                borderRadius: 4, padding: '2px 8px', fontSize: 11,
                fontWeight: 700, whiteSpace: 'nowrap', minWidth: 80, textAlign: 'center',
              }}>
                {item.tipo && item.status === 'pendente' ? item.tipo : badgeAtual.label}
              </span>

              <span style={{
                color: '#f1f5f9', fontSize: 13, flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {item.nome_cotacao}
              </span>

              {precoEditavel ? (
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  minWidth: 118,
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

              {podeToggle && (
                <button
                  onClick={() => toggle(idx)}
                  disabled={!aprovado && precoAtual == null}
                  style={{
                    background: (!aprovado && precoAtual == null) ? '#475569' : aprovado ? '#ef4444' : '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '4px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: (!aprovado && precoAtual == null) ? 'not-allowed' : 'pointer',
                    minWidth: 70,
                  }}
                >
                  {aprovado ? 'Rejeitar' : 'Aprovar'}
                </button>
              )}
              {automaticoConfiavel && item.preco && (
                <span style={{
                  color: precoAlterado ? '#f59e0b' : '#4ade80',
                  fontSize: 12,
                  fontWeight: 800,
                  minWidth: 96,
                  textAlign: 'center',
                }}>
                  {precoAlterado ? 'Preço alterado' : 'Automático'}
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
