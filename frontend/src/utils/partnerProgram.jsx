export const CARLOS_PARTNER_CODE = 'carlos14off';
export const PARTNER_COUPON_ENABLED = false;

const PARTNER_CONFIGS = {
  [CARLOS_PARTNER_CODE]: {
    code: CARLOS_PARTNER_CODE,
    name: 'Carlos Vinicios',
    discountLabel: 'Cupom pausado por enquanto',
    discountPercentLabel: 'Pausado',
    checkoutFinalPrice: null,
    commissionLabel: 'R$ 40 por assinatura ativa',
    status: 'Piloto ativo'
  }
};

export const normalizePartnerCode = (value) => {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);
};

const normalizeName = (value) => {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
};

const userHasCode = (user, code) => {
  const candidates = [
    user?.partner?.code,
    user?.partnerCode,
    user?.referralOwnerCode,
    user?.referralCodeOwner,
    user?.affiliateCode,
    user?.couponCode
  ];
  return candidates.some((candidate) => normalizePartnerCode(candidate) === code);
};

const isCarlosPilotUser = (user) => {
  if (!user) return false;
  const code = CARLOS_PARTNER_CODE;
  if (user?.partner?.enabled && userHasCode(user, code)) return true;
  if (user?.partnerEnabled && userHasCode(user, code)) return true;
  if (userHasCode(user, code)) return true;

  const name = normalizeName(user.name || user.nome || user.displayName);
  return name.includes('carlos') && (name.includes('vinicios') || name.includes('vinicius'));
};

export const getPartnerConfig = (user) => {
  if (!isCarlosPilotUser(user)) return null;
  return PARTNER_CONFIGS[CARLOS_PARTNER_CODE];
};

export const buildPartnerSignupLink = (code) => {
  const normalized = normalizePartnerCode(code);
  if (!normalized) return '';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://venpro.com.br';
  return `${origin}/register?ref=${encodeURIComponent(normalized)}`;
};

export const getPartnerCouponDiscount = (planPrice, code) => {
  if (!PARTNER_COUPON_ENABLED) return null;

  const normalized = normalizePartnerCode(code);
  const config = PARTNER_CONFIGS[normalized];
  const price = Number(planPrice || 0);
  if (!config || !price || !config.checkoutFinalPrice || config.checkoutFinalPrice >= price) {
    return null;
  }

  const finalPrice = Number(config.checkoutFinalPrice);
  const discountAmount = Number((price - finalPrice).toFixed(2));
  return {
    code: config.code,
    label: config.discountLabel,
    percentLabel: config.discountPercentLabel,
    finalPrice,
    discountAmount
  };
};
