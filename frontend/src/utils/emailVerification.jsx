import { sendEmailVerification } from 'firebase/auth';

export function emailVerificationActionSettings() {
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://venpro.com.br';

  return {
    url: `${origin}/login?emailVerified=1`,
    handleCodeInApp: false,
  };
}

export function sendVerificationEmail(user) {
  if (!user) {
    throw new Error('Usuário não autenticado');
  }
  return sendEmailVerification(user, emailVerificationActionSettings());
}
