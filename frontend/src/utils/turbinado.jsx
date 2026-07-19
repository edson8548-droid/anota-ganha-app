import React from 'react';

const TURBINADO_NAMES = ['camil', 'falcon', 'jde', 'm dias', 'mondelez', 'softys', 'vigor', 'ype'];

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export const isTurbinadoIndustry = (name) => {
  const normalized = normalize(name);
  return TURBINADO_NAMES.some(candidate =>
    normalized === candidate || normalized.startsWith(`${candidate} `));
};

export const TurbinadoBadge = () => (
  <span
    title="Indústria participante da Campanha Turbinado"
    style={{
      display: 'inline-flex', alignItems: 'center', marginLeft: 5, padding: '2px 7px',
      borderRadius: 999, background: 'linear-gradient(135deg, #f59e0b, #f97316)',
      color: '#18181b', fontSize: 10, fontWeight: 900, letterSpacing: '.04em',
      verticalAlign: 1, whiteSpace: 'nowrap',
    }}
  >
    ⚡ TURBINADO
  </span>
);
