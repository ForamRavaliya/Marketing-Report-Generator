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

//Emails
export const getEmailSettings = async (clientId) => {
  const res = await api.get(`/email/settings/${clientId}`);
  return res.data;
};

export const saveEmailSettings = async (clientId, data) => {
  const res = await api.post(`/email/settings/${clientId}`, data);
  return res.data;
};

export const sendTestEmail = async (data) => {
  const res = await api.post('/email/test', data);
  return res.data;
};

export const sendMonthlyReport = async (clientId) => {
  const res = await api.post(`/email/send-monthly/${clientId}`);
  return res.data;
};

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
/*
export const getAdAccounts = (clientId) =>
  api.get(`/ad-accounts/client/${clientId}`).then(r => r.data);

export const createAdAccount = (data) =>
  api.post('/ad-accounts', data).then(r => r.data);

export const deleteAdAccount = (id) =>
  api.delete(`/ad-accounts/${id}`).then(r => r.data);

export const syncAdAccount = (id) =>
    api.post(`/ad-accounts/${id}/sync`).then(r => r.data);
*/

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
export const getReportHistory = async (clientId) => {
  const res = await api.get(`/reports/history/${clientId}`);
  return res.data;
};
export const deleteReport = (reportId) =>
  api.delete(`/reports/${reportId}`).then(r => r.data);

export const previewUpload = (formData, onUploadProgress) =>
  api.post('/uploads/preview', formData, {
    onUploadProgress: (e) => {
      if (onUploadProgress && e.total) {
        onUploadProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  }).then(res => res.data);

export const confirmUploadMapping = (uploadId, mapping) =>
  api.post(`/uploads/${uploadId}/confirm-mapping`, { mapping })
    .then(res => res.data);
 // Subscription
  export const getSubscription = async () => {
    const res = await api.get('/subscription');
    return res.data;
  };
  export const cancelDowngrade = () =>
    api.put('/subscription/cancel-downgrade').then(r => r.data);
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

// Integrations
/*
export const getIntegrations = () =>
  api.get('/integrations').then(r => r.data);

export const demoConnectIntegration = (data) =>
  api.post('/integrations/demo-connect', data).then(r => r.data);

export const syncIntegration = (id) =>
  api.post(`/integrations/${id}/sync`).then(r => r.data);

export const getIntegrationLogs = () =>
  api.get('/integrations/logs').then(r => r.data);
*/
// Agency
export const getAgency = () => api.get('/agency').then(r => r.data);
export const updateAgency = async (data) => {
  const res = await api.put('/agency', data);
  return res.data;
};
export default api;
