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

export default api;
