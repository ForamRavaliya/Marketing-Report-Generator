const normalize = (value = '') =>
  String(value)
    .toLowerCase()
    .replace(/[_\-()%₹$,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const ADS_KEYWORDS = [
  'spend',
  'amount spent',
  'ad spend',
  'impressions',
  'reach',
  'clicks',
  'ctr',
  'cpc',
  'cpm',
  'leads',
  'results',
  'cost per result',
  'cost per lead',
  'roas',
  'campaign',
];

const SALES_KEYWORDS = [
  'sales',
  'revenue',
  'orders',
  'order id',
  'quantity',
  'qty',
  'aov',
  'average order value',
  'refund',
  'refunds',
  'profit',
  'gross profit',
  'net profit',
  'margin',
  'sku',
  'product',
];

function detectReportType(headers = [], mapping = {}) {
  const text = [
    ...headers,
    ...Object.keys(mapping || {}),
    ...Object.values(mapping || {}),
  ]
    .map(normalize)
    .join(' ');

  let adsScore = 0;
  let salesScore = 0;

  ADS_KEYWORDS.forEach((word) => {
    if (text.includes(normalize(word))) adsScore += 1;
  });

  SALES_KEYWORDS.forEach((word) => {
    if (text.includes(normalize(word))) salesScore += 1;
  });

  if (salesScore > adsScore) return 'sales';
  return 'ads';
}

module.exports = {
  detectReportType,
};