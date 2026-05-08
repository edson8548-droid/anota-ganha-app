const rawBackendUrl = process.env.REACT_APP_BACKEND_URL || '';

export const BACKEND_URL = rawBackendUrl.replace(/\/+$/, '');
export const API_BASE_URL = `${BACKEND_URL}/api`;
export const MP_PUBLIC_KEY = process.env.REACT_APP_MP_PUBLIC_KEY || '';

export const backendUrl = (path = '') => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_URL}${normalizedPath}`;
};

export const apiUrl = (path = '') => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};
