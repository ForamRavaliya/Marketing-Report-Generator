const axios = require('axios');
const crypto = require('crypto');
const { sanitizeImportedMetrics } = require('../../utils/metrics');

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-07';

const configured = () =>
  Boolean(
    process.env.SHOPIFY_API_KEY &&
      process.env.SHOPIFY_API_SECRET &&
      process.env.SHOPIFY_REDIRECT_URI
  );

const assertConfigured = () => {
  if (!configured()) {
    throw new Error('Shopify integration is not configured.');
  }
};

const normalizeShopDomain = (shop = '') => {
  const clean = String(shop)
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();

  if (!clean) return '';
  return clean.endsWith('.myshopify.com') ? clean : `${clean}.myshopify.com`;
};

const buildShopifyOAuthUrl = ({ shop, state }) => {
  assertConfigured();

  const shopDomain = normalizeShopDomain(shop);
  if (!shopDomain) {
    throw new Error('Shopify store domain is required.');
  }

  const params = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY,
    scope: ['read_orders', 'read_products'].join(','),
    redirect_uri: process.env.SHOPIFY_REDIRECT_URI,
    state,
  });

  return {
    shopDomain,
    authUrl: `https://${shopDomain}/admin/oauth/authorize?${params.toString()}`,
  };
};

const verifyShopifyHmac = (query = {}) => {
  const { hmac, signature, ...rest } = query;
  if (!hmac) return false;

  const message = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${Array.isArray(rest[key]) ? rest[key].join(',') : rest[key]}`)
    .join('&');

  const digest = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET || '')
    .update(message)
    .digest('hex');

  const digestBuffer = Buffer.from(digest);
  const hmacBuffer = Buffer.from(String(hmac));
  return digestBuffer.length === hmacBuffer.length && crypto.timingSafeEqual(digestBuffer, hmacBuffer);
};

const exchangeCodeForToken = async ({ shop, code }) => {
  assertConfigured();

  const shopDomain = normalizeShopDomain(shop);
  const response = await axios.post(`https://${shopDomain}/admin/oauth/access_token`, {
    client_id: process.env.SHOPIFY_API_KEY,
    client_secret: process.env.SHOPIFY_API_SECRET,
    code,
  });

  if (!response.data?.access_token) {
    throw new Error('Shopify OAuth did not return an access token.');
  }

  return {
    accessToken: response.data.access_token,
    scope: response.data.scope || 'read_orders,read_products',
    shopDomain,
  };
};

const parseLinkHeader = (link = '') => {
  const next = String(link)
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.includes('rel="next"'));

  if (!next) return null;
  const match = next.match(/<([^>]+)>/);
  return match ? match[1] : null;
};

const fetchShopifyOrders = async ({ shop, accessToken, dateFrom, dateTo }) => {
  assertConfigured();

  const shopDomain = normalizeShopDomain(shop);
  const rows = [];
  let url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/orders.json`;
  let params = {
    status: 'any',
    limit: 250,
    created_at_min: `${dateFrom}T00:00:00Z`,
    created_at_max: `${dateTo}T23:59:59Z`,
    fields: [
      'id',
      'created_at',
      'source_name',
      'landing_site',
      'total_price',
      'currency',
      'refunds',
      'line_items',
    ].join(','),
  };

  while (url) {
    const response = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
      },
      params,
    });

    rows.push(...(response.data?.orders || []));
    url = parseLinkHeader(response.headers?.link);
    params = undefined;
  }

  return rows;
};

const firstDayOfMonth = (value) => {
  const date = value ? new Date(value) : new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
};

const orderRefundTotal = (order = {}) =>
  (order.refunds || []).reduce((sum, refund) => {
    const transactions = refund.transactions || [];
    const transactionTotal = transactions.reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
    return sum + transactionTotal;
  }, 0);

const orderQuantity = (order = {}) =>
  (order.line_items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);

const orderCampaignName = (order = {}) => {
  const source = String(order.source_name || '').trim();
  if (source) return `Shopify ${source}`;

  const product = order.line_items?.find((item) => item.title)?.title;
  return product || 'Shopify Orders';
};

const normalizeShopifyOrders = (orders = []) => {
  const grouped = new Map();

  for (const order of orders) {
    const date = order.created_at ? new Date(order.created_at).toISOString().slice(0, 10) : null;
    const reportMonth = firstDayOfMonth(date);
    const campaignName = orderCampaignName(order);
    const key = `${reportMonth}::${campaignName}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        platform: 'shopify',
        campaignName,
        report_month: reportMonth,
        date_range_start: date,
        date_range_end: date,
        orders: 0,
        purchases: 0,
        conversions: 0,
        revenue: 0,
        refunds: 0,
        quantity: 0,
      });
    }

    const target = grouped.get(key);
    const revenue = Number(order.total_price || 0);
    const refunds = orderRefundTotal(order);
    const quantity = orderQuantity(order);

    target.orders += 1;
    target.purchases += 1;
    target.conversions += 1;
    target.revenue += revenue;
    target.refunds += refunds;
    target.quantity += quantity;
    target.date_range_start = [target.date_range_start, date].filter(Boolean).sort()[0] || date;
    target.date_range_end = [target.date_range_end, date].filter(Boolean).sort().reverse()[0] || date;
  }

  return Array.from(grouped.values()).map((row) => {
    const metrics = sanitizeImportedMetrics({
      ...row,
      spend: 0,
      clicks: 0,
      impressions: 0,
    });

    return {
      ...metrics,
      orders: row.orders,
      purchases: row.purchases,
      conversions: row.conversions,
      revenue: row.revenue,
      refunds: row.refunds,
      quantity: row.quantity,
      platform: 'shopify',
      campaignName: row.campaignName,
      report_month: row.report_month,
      date_range_start: row.date_range_start,
      date_range_end: row.date_range_end,
      raw_data: {
        source: 'auto_sync',
        platform: 'shopify',
        salesMetrics: {
          orders: row.orders,
          purchases: row.purchases,
          revenue: row.revenue,
          refunds: row.refunds,
          quantity: row.quantity,
          aov: row.orders > 0 ? row.revenue / row.orders : 0,
        },
      },
    };
  });
};

module.exports = {
  assertConfigured,
  buildShopifyOAuthUrl,
  exchangeCodeForToken,
  fetchShopifyOrders,
  normalizeShopDomain,
  normalizeShopifyOrders,
  verifyShopifyHmac,
};
