const axios = require('axios');
const { sanitizeImportedMetrics } = require('../../utils/metrics');

const META_API_VERSION = process.env.META_API_VERSION || 'v20.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

const configured = () =>
  Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_REDIRECT_URI);

const assertConfigured = () => {
  if (!configured()) {
    throw new Error('Meta integration is not configured. Please set META_APP_ID, META_APP_SECRET and META_REDIRECT_URI.');
  }
};

const buildMetaOAuthUrl = ({ state }) => {
  assertConfigured();

  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    redirect_uri: process.env.META_REDIRECT_URI,
    state,
    response_type: 'code',
    scope: [
      'ads_read',
      'business_management',
      'pages_read_engagement',
    ].join(','),
  });

  return `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?${params.toString()}`;
};

const exchangeCodeForToken = async (code) => {
  assertConfigured();

  const shortToken = await axios.get(`${META_GRAPH_BASE}/oauth/access_token`, {
    params: {
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      redirect_uri: process.env.META_REDIRECT_URI,
      code,
    },
  });

  const token = shortToken.data?.access_token;
  if (!token) throw new Error('Meta OAuth did not return an access token.');

  const longToken = await axios.get(`${META_GRAPH_BASE}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      fb_exchange_token: token,
    },
  });

  return {
    accessToken: longToken.data?.access_token || token,
    expiresIn: longToken.data?.expires_in || shortToken.data?.expires_in || null,
  };
};

const fetchAdAccounts = async (accessToken) => {
  const response = await axios.get(`${META_GRAPH_BASE}/me/adaccounts`, {
    params: {
      access_token: accessToken,
      fields: 'id,account_id,name,account_status,currency,timezone_name',
      limit: 100,
    },
  });

  return response.data?.data || [];
};

const cleanAdAccountId = (accountId) =>
  String(accountId || '').startsWith('act_') ? String(accountId) : `act_${accountId}`;

const fetchMetaInsights = async ({ accountId, accessToken, dateFrom, dateTo }) => {
  if (!accountId || !accessToken) {
    throw new Error('Meta account_id and access token are required.');
  }

  const response = await axios.get(`${META_GRAPH_BASE}/${cleanAdAccountId(accountId)}/insights`, {
    params: {
      access_token: accessToken,
      level: 'campaign',
      time_increment: 1,
      time_range: JSON.stringify({
        since: dateFrom,
        until: dateTo,
      }),
      fields: [
        'campaign_id',
        'campaign_name',
        'spend',
        'impressions',
        'reach',
        'clicks',
        'actions',
        'action_values',
        'ctr',
        'cpc',
        'date_start',
        'date_stop',
      ].join(','),
      limit: 500,
    },
  });

  return response.data?.data || [];
};

const actionValue = (items = [], matchers = []) =>
  items.reduce((sum, item) => {
    const type = String(item.action_type || '').toLowerCase();
    return matchers.some((matcher) => type.includes(matcher))
      ? sum + Number(item.value || 0)
      : sum;
  }, 0);

const firstDayOfMonth = (value) => {
  const date = value ? new Date(value) : new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
};

const normalizeMetaInsights = (rows = []) =>
  rows.map((row) => {
    const leads = actionValue(row.actions, ['lead']);
    const purchases = actionValue(row.actions, ['purchase', 'omni_purchase']);
    const revenue = actionValue(row.action_values, ['purchase', 'omni_purchase']);
    const conversions = purchases > 0 ? purchases : leads;

    const metrics = sanitizeImportedMetrics({
      spend: row.spend,
      impressions: row.impressions,
      reach: row.reach,
      clicks: row.clicks,
      conversions,
      leads,
      purchases,
      revenue,
    });

    return {
      ...metrics,
      platform: 'meta',
      campaignId: row.campaign_id || null,
      campaignName: row.campaign_name || 'Unknown Campaign',
      report_month: firstDayOfMonth(row.date_start || row.date_stop),
      date_range_start: row.date_start || null,
      date_range_end: row.date_stop || row.date_start || null,
      raw_data: {
        source: 'auto_sync',
        platform: 'meta',
        metaCampaignId: row.campaign_id || null,
      },
    };
  });

module.exports = {
  assertConfigured,
  buildMetaOAuthUrl,
  exchangeCodeForToken,
  fetchAdAccounts,
  fetchMetaInsights,
  normalizeMetaInsights,
};
