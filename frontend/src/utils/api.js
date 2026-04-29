import axios from 'axios';

const api = axios.create({
  baseURL: "https://marketing-report-generator-p9wj.onrender.com/api"
});
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
export const getClients = () => api.get('/clients').then(r => r.data);
export const getClient = (id) => api.get(`/clients/${id}`).then(r => r.data);
export const createClient = (data) => api.post('/clients', data).then(r => r.data);
export const updateClient = (id, data) => api.put(`/clients/${id}`, data).then(r => r.data);
export const deleteClient = (id) => api.delete(`/clients/${id}`).then(r => r.data);

// Uploads
export const uploadFile = (formData, onProgress) =>
  api.post('/uploads', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: e => onProgress && onProgress(Math.round((e.loaded * 100) / e.total)),
  }).then(r => r.data);

export const manualEntry = (data) => api.post('/uploads/manual', data).then(r => r.data);
export const getUploads = (clientId) => api.get(`/uploads/client/${clientId}`).then(r => r.data);
export const getUploadStatus = (id) => api.get(`/uploads/${id}/status`).then(r => r.data);

// Performance
export const getSummary = (clientId, params) =>
  api.get(`/performance/summary/${clientId}`, { params }).then(r => r.data);
export const getTrends = (clientId, params) =>
  api.get(`/performance/trends/${clientId}`, { params }).then(r => r.data);
export const getComparison = (clientId, params) =>
  api.get(`/performance/comparison/${clientId}`, { params }).then(r => r.data);
export const getCampaigns = (clientId, params) =>
  api.get(`/performance/campaigns/${clientId}`, { params }).then(r => r.data);
export const getPlatforms = (clientId, params) =>
  api.get(`/performance/platforms/${clientId}`, { params }).then(r => r.data);

// Reports
export const generateReport = (data) => api.post('/reports/generate', data).then(r => r.data);
export const getReportHistory = (clientId) => api.get(`/reports/history/${clientId}`).then(r => r.data);

// Dashboard
export const getDashboardOverview = () => api.get('/dashboard/overview').then(r => r.data);

// Agency
export const getAgency = () => api.get('/agency').then(r => r.data);
export const updateAgency = (formData) =>
  api.put('/agency', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);

export default api;
