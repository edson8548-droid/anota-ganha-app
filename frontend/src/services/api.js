import axios from 'axios';
import { auth } from '../firebase/config';

const API_URL = "https://api.venpro.com.br/api"

const api = axios.create({
  baseURL: API_URL,
});

// Attach Firebase ID token to every request
api.interceptors.request.use(async (config) => {
  const currentUser = auth.currentUser;
  if (currentUser) {
    const token = await currentUser.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
    // Save token for Chrome extension
    localStorage.setItem('venpro_ext_token', token);
  }
  return config;
});

// Campaigns
export const getCampaigns = () => api.get('/campaigns');
export const getCampaign = (id) => api.get(`/campaigns/${id}`);
export const createCampaign = (data) => api.post('/campaigns', data);
export const updateCampaign = (id, data) => api.put(`/campaigns/${id}`, data);
export const deleteCampaign = (id) => api.delete(`/campaigns/${id}`);
export const resetCampaign = (id) => api.post(`/campaigns/${id}/reset`);

// Sheets
export const getSheets = (campaignId) => api.get('/sheets', { params: { campaign_id: campaignId } });
export const getSheet = (id) => api.get(`/sheets/${id}`);
export const createSheet = (data) => api.post('/sheets', data);
export const updateSheet = (id, data) => api.put(`/sheets/${id}`, data);
export const deleteSheet = (id) => api.delete(`/sheets/${id}`);

// Clients
export const getClients = (params) => api.get('/clients', { params });
export const getClient = (id) => api.get(`/clients/${id}`);
export const createClient = (data) => api.post('/clients', data);
export const updateClient = (id, data) => api.put(`/clients/${id}`, data);
export const deleteClient = (id) => api.delete(`/clients/${id}`);

// Stats
export const getCampaignStats = (campaignId) => api.get(`/stats/${campaignId}`);
export const getCampaignStatsByCity = (campaignId) => api.get(`/stats/${campaignId}/cities`);

// Users
export const uploadAvatar = (file) => {
  const formData = new FormData();
  formData.append('arquivo', file);
  return api.post('/users/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
};

export default api;
