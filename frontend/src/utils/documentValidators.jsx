export function onlyDigits(value = '') {
  return String(value).replace(/\D/g, '');
}

export function isValidCPF(value = '') {
  const cpf = onlyDigits(value);

  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calcDigit = (base) => {
    let sum = 0;
    for (let i = 0; i < base.length; i += 1) {
      sum += Number(base[i]) * (base.length + 1 - i);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  const digit1 = calcDigit(cpf.slice(0, 9));
  const digit2 = calcDigit(cpf.slice(0, 10));

  return digit1 === Number(cpf[9]) && digit2 === Number(cpf[10]);
}
