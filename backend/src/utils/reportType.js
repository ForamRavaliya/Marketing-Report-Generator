const { detectReportTypeFromDictionary } = require('./metricDictionaries');

const normalize = (value = '') =>
  String(value)
    .toLowerCase()
    .replace(/[_\-()%₹$,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const includesAny = (text, words = []) =>
  words.some((word) => text.includes(normalize(word)));

const countMatches = (text, words = []) =>
  words.reduce((count, word) => {
    return text.includes(normalize(word)) ? count + 1 : count;
  }, 0);

const SALES_CAMPAIGN_KEYWORDS = [
  'purchase',
  'purchases',
  'website purchases',
  'cost per purchase',
  'purchase value',
  'conversion value',
  'purchase conversion value',
  'revenue',
  'sales',
  'roas',
  'return on ad spend',
  'order value',
];

const LEAD_GENERATION_KEYWORDS = [
  'lead',
  'leads',
  'cost per lead',
  'cpl',
  'inquiry',
  'inquiries',
  'form submit',
  'forms submitted',
  'lead form',
  'messaging conversations',
  'messages',
  'calls',
  'contact form',
];

const SALES_DATA_KEYWORDS = [
  'order id',
  'order number',
  'sku',
  'product name',
  'quantity',
  'qty',
  'gross sales',
  'net sales',
  'refund',
  'refunds',
  'profit',
  'margin',
  'aov',
  'average order value',
];

function detectReportType(headers = [], mapping = {}) {
  const dictionaryType = detectReportTypeFromDictionary(headers, mapping, 'meta');
  if (dictionaryType) return dictionaryType;

  const text = [
    ...headers,
    ...Object.keys(mapping || {}),
    ...Object.values(mapping || {}),
  ]
    .map(normalize)
    .join(' ');

  const hasCampaignStructure =
    includesAny(text, [
      'campaign',
      'campaign name',
      'ad set',
      'ad set name',
      'ad name',
      'impressions',
      'reach',
      'clicks',
      'amount spent',
      'spend',
      'ctr',
      'cpc',
      'cpm',
    ]);

  const salesCampaignScore = countMatches(text, SALES_CAMPAIGN_KEYWORDS);
  const leadScore = countMatches(text, LEAD_GENERATION_KEYWORDS);
  const salesDataScore = countMatches(text, SALES_DATA_KEYWORDS);

  if (salesDataScore >= 4 && !hasCampaignStructure) {
    return 'sales_data';
  }

  if (hasCampaignStructure && salesCampaignScore >= 2 && salesCampaignScore > leadScore) {
    return 'sales_campaign';
  }

  if (hasCampaignStructure && leadScore >= 2 && leadScore >= salesCampaignScore) {
    return 'lead_generation';
  }

  if (salesCampaignScore >= 3 && salesCampaignScore > leadScore) {
    return 'sales_campaign';
  }

  if (leadScore >= 2 && leadScore >= salesCampaignScore) {
    return 'lead_generation';
  }

  if (salesDataScore >= 3) {
    return 'sales_data';
  }

  return 'needs_review';
}

module.exports = {
  detectReportType,
};
