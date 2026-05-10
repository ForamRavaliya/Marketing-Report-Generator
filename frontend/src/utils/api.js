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
export const updateAdAccountFrequency = (id, syncFrequency) =>
  api.put(`/ad-accounts/${id}/frequency`, { syncFrequency }).then(r => r.data);
export const getSyncLogs = (clientId) =>
  api.get(`/ad-accounts/client/${clientId}/logs`).then(r => r.data);
// Ad Accounts
export const getAdAccounts = (clientId) =>
  api.get(`/ad-accounts/client/${clientId}`).then(r => r.data);

export const createAdAccount = (data) =>
  api.post('/ad-accounts', data).then(r => r.data);

export const deleteAdAccount = (id) =>
  api.delete(`/ad-accounts/${id}`).then(r => r.data);

export const syncAdAccount = (id) =>
    api.post(`/ad-accounts/${id}/sync`).then(r => r.data);


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

// AI Insights
export const generateAIInsights = (clientId) =>
  api.post(`/ai-insights/generate/${clientId}`).then(r => r.data);

export const getAIInsights = (clientId) =>
  api.get(`/ai-insights/${clientId}`).then(r => r.data);

// Reports
export const generateReport = (data) => api.post('/reports/generate', data).then(r => r.data);
export const getReportHistory = (clientId) => api.get(`/reports/history/${clientId}`).then(r => r.data);
export const deleteReport = (reportId) =>
  api.delete(`/reports/${reportId}`).then(r => r.data);


 // Subscription
    export const getSubscription = () =>
      api.get('/subscription').then(r => r.data);

    export const updateSubscriptionPlan = (planName) =>
      api.put('/subscription/plan', { planName }).then(r => r.data);

// Payments
export const createPaymentOrder = (data) =>
  api.post('/payments/create-order', data).then(r => r.data);

export const verifyPayment = (data) =>
  api.post('/payments/verify', data).then(r => r.data);

export const getBillingHistory = () =>
  api.get('/payments/history').then(r => r.data);
// Dashboard
export const getDashboardOverview = () => api.get('/dashboard/overview').then(r => r.data);

export const generateReceipt = (paymentId) =>
  api.get(`/payments/receipt/${paymentId}`).then(r => r.data);

// Agency
export const getAgency = () => api.get('/agency').then(r => r.data);
export const updateAgency = (formData) =>
  api.put('/agency', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);

export default api;
