const cleanEan = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 14 ? digits : '';
};

const normalizeName = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const uniqueIndex = (items, keyBuilder) => {
  const index = new Map();
  items.forEach(item => {
    const key = keyBuilder(item);
    if (!key) return;
    if (index.has(key)) index.set(key, null);
    else index.set(key, item);
  });
  return index;
};

export const updateVitrinePrices = (currentItems = [], tableItems = []) => {
  const pricedItems = tableItems.filter(item => Number(item.preco) > 0);
  const byEan = uniqueIndex(pricedItems, item => cleanEan(item.ean));
  const byName = uniqueIndex(pricedItems, item => normalizeName(item.nome));
  const matched = [];
  const unmatched = [];

  const items = currentItems.map(item => {
    if (item._deleted) return item;
    const ean = cleanEan(item.ean);
    const match = ean ? byEan.get(ean) : byName.get(normalizeName(item.product_name));
    if (!match) {
      unmatched.push(item.product_name || 'Produto sem nome');
      return item;
    }
    matched.push({ name: item.product_name, from: Number(item.price) || 0, to: Number(match.preco) });
    return { ...item, price: String(match.preco) };
  });

  return { items, matched, unmatched };
};
