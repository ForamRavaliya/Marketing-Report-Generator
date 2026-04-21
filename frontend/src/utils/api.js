import axios from 'axios';

const api = axios.create({ baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000' });

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Clients
export const getClients = () => api.get('/api/clients').then(r => r.data);
export const getClient = (id) => api.get(`/api/clients/${id}`).then(r => r.data);
export const createClient = (data) => api.post('/api/clients', data).then(r => r.data);
export const updateClient = (id, data) => api.put(`/api/clients/${id}`, data).then(r => r.data);
export const deleteClient = (id) => api.delete(`/api/clients/${id}`).then(r => r.data);

// Uploads
export const uploadFile = (formData, onProgress) =>
  api.post('/api/uploads', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: e => onProgress && onProgress(Math.round((e.loaded * 100) / e.total)),
  }).then(r => r.data);

export const manualEntry = (data) => api.post('/api/uploads/manual', data).then(r => r.data);
export const getUploads = (clientId) => api.get(`/api/uploads/client/${clientId}`).then(r => r.data);
export const getUploadStatus = (id) => api.get(`/api/uploads/${id}/status`).then(r => r.data);

// Performance
export const getSummary = (clientId, params) =>
  api.get(`/api/performance/summary/${clientId}`, { params }).then(r => r.data);
export const getTrends = (clientId, params) =>
  api.get(`/api/performance/trends/${clientId}`, { params }).then(r => r.data);
export const getComparison = (clientId, params) =>
  api.get(`/api/performance/comparison/${clientId}`, { params }).then(r => r.data);
export const getCampaigns = (clientId, params) =>
  api.get(`/api/performance/campaigns/${clientId}`, { params }).then(r => r.data);
export const getPlatforms = (clientId, params) =>
  api.get(`/api/performance/platforms/${clientId}`, { params }).then(r => r.data);

// Reports
export const generateReport = (data) => api.post('/api/reports/generate', data).then(r => r.data);
export const getReportHistory = (clientId) => api.get(`/api/reports/history/${clientId}`).then(r => r.data);

// Dashboard
export const getDashboardOverview = () => api.get('/api/dashboard/overview').then(r => r.data);

// Agency
export const getAgency = () => api.get('/api/agency').then(r => r.data);
export const updateAgency = (formData) =>
  api.put('/api/agency', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);

export default api;
