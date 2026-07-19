const normalizeSearchText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export const matchesProductSearch = (productName, ean, query) => {
  const terms = normalizeSearchText(query).split(' ').filter(Boolean);
  if (terms.length === 0) return true;
  const searchable = `${normalizeSearchText(productName)} ${String(ean || '').replace(/\D/g, '')}`;
  return terms.every(term => searchable.includes(term));
};
