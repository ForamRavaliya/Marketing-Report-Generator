const axios = require('axios');
const { sanitizeImportedMetrics } = require('../../utils/metrics');

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_OAUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v17';
const GOOGLE_ADS_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

const configured = () =>
  Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI &&
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  );

const assertConfigured = () => {
  if (!configured()) {
    throw new Error('Google Ads integration is not configured.');
  }
};

const buildGoogleOAuthUrl = ({ state }) => {
  assertConfigured();

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    scope: 'https://www.googleapis.com/auth/adwords',
  });

  return `${GOOGLE_OAUTH_URL}?${params.toString()}`;
};

const exchangeCodeForToken = async (code) => {
  assertConfigured();

  const response = await axios.post(
    GOOGLE_TOKEN_URL,
    new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  if (!response.data?.access_token) {
    throw new Error('Google OAuth did not return an access token.');
  }

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token || null,
    expiresIn: response.data.expires_in || null,
    scope: response.data.scope || 'https://www.googleapis.com/auth/adwords',
  };
};

const refreshGoogleAccessToken = async (refreshToken) => {
  assertConfigured();

  if (!refreshToken) {
    throw new Error('Google Ads refresh token is missing. Please reconnect Google Ads.');
  }

  const response = await axios.post(
    GOOGLE_TOKEN_URL,
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  return {
    accessToken: response.data.access_token,
    expiresIn: response.data.expires_in || null,
  };
};

const googleAdsHeaders = (accessToken, loginCustomerId = null) => {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  };

  if (loginCustomerId || process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
    headers['login-customer-id'] = String(loginCustomerId || process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID).replace(/-/g, '');
  }

  return headers;
};

const fetchAccessibleCustomers = async (accessToken) => {
  assertConfigured();

  const response = await axios.get(`${GOOGLE_ADS_BASE}/customers:listAccessibleCustomers`, {
    headers: googleAdsHeaders(accessToken),
  });

  return (response.data?.resourceNames || [])
    .map((resourceName) => String(resourceName).replace('customers/', ''))
    .filter(Boolean);
};

const searchGoogleAds = async ({ customerId, accessToken, query }) => {
  const response = await axios.post(
    `${GOOGLE_ADS_BASE}/customers/${String(customerId).replace(/-/g, '')}/googleAds:searchStream`,
    { query },
    { headers: googleAdsHeaders(accessToken) }
  );

  return Array.isArray(response.data)
    ? response.data.flatMap((chunk) => chunk.results || [])
    : [];
};

const fetchCustomerMetadata = async ({ customerId, accessToken }) => {
  const rows = await searchGoogleAds({
    customerId,
    accessToken,
    query: `
      SELECT
        customer.id,
        customer.descriptive_name
      FROM customer
      LIMIT 1
    `,
  });

  const customer = rows[0]?.customer || {};
  return {
    accountId: String(customer.id || customerId).replace(/-/g, ''),
    accountName: customer.descriptiveName || customer.descriptive_name || `Google Ads ${customerId}`,
  };
};

const fetchGoogleCampaignMetrics = async ({ customerId, accessToken, dateFrom, dateTo }) => {
  assertConfigured();

  return searchGoogleAds({
    customerId,
    accessToken,
    query: `
      SELECT
        campaign.id,
        campaign.name,
        segments.date,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.conversions_value,
        metrics.ctr,
        metrics.average_cpc
      FROM campaign
      WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
        AND campaign.status != 'REMOVED'
      ORDER BY segments.date ASC
    `,
  });
};

const firstDayOfMonth = (value) => {
  const date = value ? new Date(value) : new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
};

const normalizeGoogleAdsRows = (rows = []) =>
  rows.map((row) => {
    const campaign = row.campaign || {};
    const metrics = row.metrics || {};
    const segments = row.segments || {};
    const spend = Number(metrics.costMicros ?? metrics.cost_micros ?? 0) / 1000000;
    const conversions = Number(metrics.conversions || 0);
    const revenue = Number(metrics.conversionsValue ?? metrics.conversions_value ?? 0);

    const normalized = sanitizeImportedMetrics({
      spend,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      conversions,
      purchases: conversions,
      revenue,
    });

    return {
      ...normalized,
      platform: 'google_ads',
      campaignId: campaign.id || null,
      campaignName: campaign.name || 'Unknown Campaign',
      report_month: firstDayOfMonth(segments.date),
      date_range_start: segments.date || null,
      date_range_end: segments.date || null,
      raw_data: {
        source: 'auto_sync',
        platform: 'google_ads',
        googleCampaignId: campaign.id || null,
      },
    };
  });

module.exports = {
  assertConfigured,
  buildGoogleOAuthUrl,
  exchangeCodeForToken,
  refreshGoogleAccessToken,
  fetchAccessibleCustomers,
  fetchCustomerMetadata,
  fetchGoogleCampaignMetrics,
  normalizeGoogleAdsRows,
};
