import { describe, expect, it } from 'vitest';
import { matchesProductSearch } from './productSearch';

describe('matchesProductSearch', () => {
  it('busca por partes do nome sem exigir acentos', () => {
    expect(matchesProductSearch('Biscoito Tortinha Chocolate', '', 'bisc tort')).toBe(true);
    expect(matchesProductSearch('Queijo Ralado', '', 'bisc tort')).toBe(false);
  });

  it('busca pelo EAN', () => {
    expect(matchesProductSearch('Produto', '7891234567890', '345678')).toBe(true);
  });
});
