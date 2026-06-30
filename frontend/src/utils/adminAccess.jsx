const ADMIN_ALLOWED_EMAILS = new Set(['edson854_8@hotmail.com']);

export const canAccessAdminPanel = (user) => {
  const email = String(user?.email || '').trim().toLowerCase();
  return Boolean(user?.isAdmin && ADMIN_ALLOWED_EMAILS.has(email));
};
