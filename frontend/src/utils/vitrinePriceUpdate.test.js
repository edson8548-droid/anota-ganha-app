import { describe, expect, it } from 'vitest';
import { updateVitrinePrices } from './vitrinePriceUpdate';

describe('updateVitrinePrices', () => {
  it('atualiza somente o preço por EAN e preserva os outros campos', () => {
    const current = [{ product_name: 'Biscoito', ean: '7891234567890', price: '5', image_url: '/foto', units_per_package: '12' }];
    const result = updateVitrinePrices(current, [{ nome: 'Outro nome', ean: '7891234567890', preco: 6.5 }]);
    expect(result.items[0]).toMatchObject({ price: '6.5', image_url: '/foto', units_per_package: '12' });
    expect(result.matched).toHaveLength(1);
  });

  it('usa nome exato sem acento somente quando a vitrine não possui EAN', () => {
    const result = updateVitrinePrices(
      [{ product_name: 'Sabão em Pó 800g', ean: '', price: '5' }],
      [{ nome: 'SABAO EM PO 800G', ean: '', preco: 7 }],
    );
    expect(result.items[0].price).toBe('7');
  });

  it('não atualiza nomes duplicados ou item com EAN diferente', () => {
    const duplicate = [{ nome: 'Produto X', preco: 7 }, { nome: 'Produto X', preco: 8 }];
    expect(updateVitrinePrices([{ product_name: 'Produto X', price: '5' }], duplicate).matched).toHaveLength(0);
    expect(updateVitrinePrices(
      [{ product_name: 'Produto X', ean: '7891234567890', price: '5' }],
      [{ nome: 'Produto X', ean: '7899999999999', preco: 7 }],
    ).matched).toHaveLength(0);
  });
});
