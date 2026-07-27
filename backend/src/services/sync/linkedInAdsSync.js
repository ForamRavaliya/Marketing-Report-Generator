const axios = require('axios');
const { sanitizeImportedMetrics } = require('../../utils/metrics');

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_API_BASE = 'https://api.linkedin.com/rest';
const LINKEDIN_VERSION = process.env.LINKEDIN_API_VERSION || '202405';

const configured = () =>
  Boolean(
    process.env.LINKEDIN_CLIENT_ID &&
      process.env.LINKEDIN_CLIENT_SECRET &&
      process.env.LINKEDIN_REDIRECT_URI
  );

const assertConfigured = () => {
  if (!configured()) {
    throw new Error('LinkedIn Ads integration is not configured.');
  }
};

const linkedInHeaders = (accessToken) => ({
  Authorization: `Bearer ${accessToken}`,
  'LinkedIn-Version': LINKEDIN_VERSION,
  'X-Restli-Protocol-Version': '2.0.0',
});

const buildLinkedInOAuthUrl = ({ state }) => {
  assertConfigured();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
    state,
    scope: ['r_ads', 'r_ads_reporting', 'offline_access'].join(' '),
  });

  return `${LINKEDIN_AUTH_URL}?${params.toString()}`;
};

const exchangeCodeForToken = async (code) => {
  assertConfigured();

  const response = await axios.post(
    LINKEDIN_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
      client_id: process.env.LINKEDIN_CLIENT_ID,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  if (!response.data?.access_token) {
    throw new Error('LinkedIn OAuth did not return an access token.');
  }

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token || null,
    expiresIn: response.data.expires_in || null,
    scope: response.data.scope || 'r_ads r_ads_reporting offline_access',
  };
};

const refreshLinkedInAccessToken = async (refreshToken) => {
  assertConfigured();

  if (!refreshToken) {
    throw new Error('LinkedIn refresh token is missing. Please reconnect LinkedIn Ads.');
  }

  const response = await axios.post(
    LINKEDIN_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.LINKEDIN_CLIENT_ID,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token || refreshToken,
    expiresIn: response.data.expires_in || null,
  };
};

const numericAccountId = (value = '') => String(value).replace('urn:li:sponsoredAccount:', '');
const accountUrn = (accountId) => `urn:li:sponsoredAccount:${numericAccountId(accountId)}`;
const campaignUrn = (campaignId) => `urn:li:sponsoredCampaign:${campaignId}`;

const fetchAdAccounts = async (accessToken) => {
  assertConfigured();

  const response = await axios.get(`${LINKEDIN_API_BASE}/adAccounts`, {
    headers: linkedInHeaders(accessToken),
    params: {
      q: 'search',
      search: '(status:(values:List(ACTIVE)))',
      fields: 'elements*(id,name,status)',
    },
  });

  return response.data?.elements || [];
};

const fetchCampaignNames = async ({ accountId, accessToken }) => {
  const response = await axios.get(`${LINKEDIN_API_BASE}/adAccounts/${numericAccountId(accountId)}/adCampaigns`, {
    headers: linkedInHeaders(accessToken),
    params: {
      q: 'search',
      fields: 'elements*(id,name)',
      count: 1000,
    },
  });

  const map = new Map();
  for (const campaign of response.data?.elements || []) {
    map.set(String(campaign.id), campaign.name || `LinkedIn Campaign ${campaign.id}`);
    map.set(campaignUrn(campaign.id), campaign.name || `LinkedIn Campaign ${campaign.id}`);
  }

  return map;
};

const dateParts = (value) => {
  const date = new Date(value);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
};

const linkedInDateRange = (dateFrom, dateTo) => {
  const start = dateParts(dateFrom);
  const end = dateParts(dateTo);
  return `(start:(year:${start.year},month:${start.month},day:${start.day}),end:(year:${end.year},month:${end.month},day:${end.day}))`;
};

const fetchLinkedInCampaignMetrics = async ({ accountId, accessToken, dateFrom, dateTo }) => {
  assertConfigured();

  const response = await axios.get(`${LINKEDIN_API_BASE}/adAnalytics`, {
    headers: linkedInHeaders(accessToken),
    params: {
      q: 'analytics',
      pivot: 'CAMPAIGN',
      timeGranularity: 'DAILY',
      dateRange: linkedInDateRange(dateFrom, dateTo),
      accounts: `List(${accountUrn(accountId)})`,
      fields: [
        'dateRange',
        'campaign',
        'impressions',
        'clicks',
        'costInLocalCurrency',
        'externalWebsiteConversions',
        'oneClickLeads',
      ].join(','),
    },
  });

  return response.data?.elements || [];
};

const firstDayOfMonth = (value) => {
  const date = value ? new Date(value) : new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
};

const dateFromLinkedInRange = (range = {}) => {
  const start = range.start || range;
  if (!start?.year || !start?.month || !start?.day) return null;
  return `${start.year}-${String(start.month).padStart(2, '0')}-${String(start.day).padStart(2, '0')}`;
};

const normalizeLinkedInRows = (rows = [], campaignNames = new Map()) =>
  rows.map((row) => {
    const campaignId = String(row.campaign || '').replace('urn:li:sponsoredCampaign:', '');
    const leads = Number(row.oneClickLeads || row.externalWebsiteConversions || 0);
    const date = dateFromLinkedInRange(row.dateRange);

    const metrics = sanitizeImportedMetrics({
      spend: row.costInLocalCurrency,
      impressions: row.impressions,
      clicks: row.clicks,
      conversions: leads,
      leads,
      revenue: 0,
    });

    return {
      ...metrics,
      platform: 'linkedin_ads',
      campaignId: campaignId || null,
      campaignName:
        campaignNames.get(row.campaign) ||
        campaignNames.get(campaignId) ||
        (campaignId ? `LinkedIn Campaign ${campaignId}` : 'Unknown Campaign'),
      report_month: firstDayOfMonth(date),
      date_range_start: date,
      date_range_end: date,
      raw_data: {
        source: 'auto_sync',
        platform: 'linkedin_ads',
        linkedInCampaign: row.campaign || null,
      },
    };
  });

module.exports = {
  assertConfigured,
  buildLinkedInOAuthUrl,
  exchangeCodeForToken,
  refreshLinkedInAccessToken,
  fetchAdAccounts,
  fetchCampaignNames,
  fetchLinkedInCampaignMetrics,
  normalizeLinkedInRows,
};
