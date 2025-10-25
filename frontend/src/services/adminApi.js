import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const api = axios.create({
  baseURL: API_URL,
});

// Add token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Admin APIs
export const getAdminUsers = () => api.get('/admin/users');
export const getAdminStats = () => api.get('/admin/stats');
export const activateUser = (email, plan) => api.post('/admin/activate-user', { user_email: email, plan });

export default api;