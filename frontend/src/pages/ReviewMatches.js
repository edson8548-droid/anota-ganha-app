import React, { useState } from 'react';

const BADGE = {
  EAN:       { bg: '#14532d', color: '#4ade80', label: 'EAN ✓' },
  APRENDIDO: { bg: '#1e3a5f', color: '#60a5fa', label: 'Aprendido ✓' },
  pendente:  { bg: '#431407', color: '#fb923c', label: 'Aguarda revisão' },
  sem_match: { bg: '#1e293b', color: '#64748b', label: 'Não encontrado' },
};

function badgeInfo(item) {
  if (item.status === 'aprovado' && item.tipo === 'EAN')       return BADGE.EAN;
  if (item.status === 'aprovado' && item.tipo === 'APRENDIDO') return BADGE.APRENDIDO;
  if (item.status === 'pendente')                               return BADGE.pendente;
  return BADGE.sem_match;
}

export default function ReviewMatches({ itens, onConfirmar, confirmando }) {
  const [aprovacoes, setAprovacoes] = useState(() =>
    itens.map(it => it.status === 'aprovado')
  );

  const toggle = (idx) =>
    setAprovacoes(prev => prev.map((v, i) => i === idx ? !v : v));

  const aprovados = aprovacoes.filter(Boolean).length;
  const total = itens.length;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 16,
      }}>
        <div>
          <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 16 }}>
            Revisar Matches
          </div>
          <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 2 }}>
            {aprovados} de {total} itens aprovados
          </div>
        </div>
        <button
          onClick={() => onConfirmar(aprovacoes)}
          disabled={confirmando || aprovados === 0}
          style={{
            background: confirmando ? '#374151' : '#e8412a',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '10px 20px',
            fontWeight: 700,
            fontSize: 14,
            cursor: confirmando ? 'not-allowed' : 'pointer',
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
          const podeToggle = item.status === 'pendente' || item.status === 'aprovado';

          return (
            <div key={idx} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: aprovado ? '#0f2d1a' : '#1e293b',
              borderRadius: 8,
              padding: '10px 14px',
              border: `1px solid ${aprovado ? '#166534' : '#334155'}`,
              opacity: item.status === 'sem_match' ? 0.55 : 1,
            }}>
              <span style={{
                background: badge.bg, color: badge.color,
                borderRadius: 4, padding: '2px 8px', fontSize: 11,
                fontWeight: 700, whiteSpace: 'nowrap', minWidth: 80, textAlign: 'center',
              }}>
                {item.tipo && item.status === 'pendente'
                  ? item.tipo
                  : badge.label}
              </span>

              <span style={{
                color: '#f1f5f9', fontSize: 13, flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {item.nome_cotacao}
              </span>

              <span style={{
                color: item.preco ? '#4ade80' : '#64748b',
                fontSize: 13, fontWeight: 700, minWidth: 70, textAlign: 'right',
              }}>
                {item.preco
                  ? `R$ ${Number(item.preco).toFixed(2).replace('.', ',')}`
                  : '—'}
              </span>

              {podeToggle && item.preco && (
                <button
                  onClick={() => toggle(idx)}
                  style={{
                    background: aprovado ? '#ef4444' : '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '4px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    minWidth: 70,
                  }}
                >
                  {aprovado ? 'Rejeitar' : 'Aprovar'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
