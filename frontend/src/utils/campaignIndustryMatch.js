const ignoredWords = new Set(['industria', 'turbinado']);

export const industryWords = (name) => String(name || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .split(/[^a-z0-9]+/)
  .filter(word => word && !ignoredWords.has(word))
  .sort();

export const findImportedIndustry = (industryName, importedIndustries = {}) => {
  const expected = industryWords(industryName).join('|');
  if (!expected) return null;
  const match = Object.entries(importedIndustries).find(([name]) => (
    industryWords(name).join('|') === expected
  ));
  return match?.[1] || null;
};
