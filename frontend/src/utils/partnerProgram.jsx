export const CARLOS_PARTNER_CODE = 'carlos14off';
export const PARCEIRO25_COUPON_CODE = 'parceiro25off';
export const PARCEIRO25_COUPON_DISPLAY_CODE = 'parceiro25%off';
export const PARTNER_COUPON_ENABLED = true;

const PARTNER_CONFIGS = {
  [CARLOS_PARTNER_CODE]: {
    code: CARLOS_PARTNER_CODE,
    name: 'Carlos Vinicios',
    active: false,
    discountLabel: 'Cupom pausado por enquanto',
    discountPercentLabel: 'Pausado',
    checkoutFinalPrice: null,
    commissionLabel: 'R$ 40 por assinatura ativa',
    status: 'Piloto ativo'
  },
  [PARCEIRO25_COUPON_CODE]: {
    code: PARCEIRO25_COUPON_DISPLAY_CODE,
    normalizedCode: PARCEIRO25_COUPON_CODE,
    name: 'Parceiro',
    active: true,
    discountLabel: '25% off',
    discountPercentLabel: '25% off',
    checkoutFinalPrice: 74.93,
    commissionLabel: '',
    status: 'Cupom único'
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

export const getPartnerCouponConfig = (code) => {
  return PARTNER_CONFIGS[normalizePartnerCode(code)] || null;
};

export const isActivePartnerCoupon = (code) => {
  const config = getPartnerCouponConfig(code);
  return Boolean(config?.active && config.checkoutFinalPrice);
};

export const getPartnerCouponDiscount = (planPrice, code) => {
  if (!PARTNER_COUPON_ENABLED) return null;

  const normalized = normalizePartnerCode(code);
  const config = PARTNER_CONFIGS[normalized];
  const price = Number(planPrice || 0);
  if (!config?.active || !price || !config.checkoutFinalPrice || config.checkoutFinalPrice >= price) {
    return null;
  }

  const finalPrice = Number(config.checkoutFinalPrice);
  const discountAmount = Number((price - finalPrice).toFixed(2));
  return {
    code: config.code,
    normalizedCode: config.normalizedCode || normalized,
    label: config.discountLabel,
    percentLabel: config.discountPercentLabel,
    finalPrice,
    discountAmount
  };
};
