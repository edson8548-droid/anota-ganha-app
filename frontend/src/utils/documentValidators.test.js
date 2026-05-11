import { isValidCPF, onlyDigits } from './documentValidators';

test('onlyDigits remove tudo que nao e numero', () => {
  expect(onlyDigits('CPF 123.456.789-09')).toBe('12345678909');
});

test('isValidCPF aceita CPF valido com mascara', () => {
  expect(isValidCPF('529.982.247-25')).toBe(true);
});

test('isValidCPF rejeita sequencia repetida', () => {
  expect(isValidCPF('111.111.111-11')).toBe(false);
});

test('isValidCPF rejeita digito verificador invalido', () => {
  expect(isValidCPF('529.982.247-24')).toBe(false);
});
