const normalizeText = (value = '') =>
  String(value)
    .toLowerCase()
    .replace(/[₹$€£()[\]{}.,:%/_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getRecordValueByAliases = (record = {}, aliases = []) => {
  const normalizedAliases = aliases.map(normalizeText);
  const entries = Object.entries(record || {}).map(([key, value]) => ({
    key,
    value,
    normalizedKey: normalizeText(key),
  }));

  const exact = entries.find((entry) => normalizedAliases.includes(entry.normalizedKey));
  if (exact) return exact.value;

  const partial = entries.find((entry) =>
    normalizedAliases.some((alias) => alias && entry.normalizedKey.includes(alias))
  );

  return partial ? partial.value : '';
};

const getTextByAliases = (record, aliases) =>
  String(getRecordValueByAliases(record, aliases) || '').trim();

const hasTextByAliases = (record, aliases) => Boolean(getTextByAliases(record, aliases));

const SUMMARY_NAMES = new Set([
  '',
  'all',
  'total',
  'totals',
  'result',
  'results',
  'overall',
  'aggregate',
  'grand total',
  'overall total',
  'account total',
]);

const isSummaryName = (name) => {
  const n = normalizeText(name);
  return (
    SUMMARY_NAMES.has(n) ||
    n.includes('grand total') ||
    n.includes('overall total') ||
    n.includes('total results') ||
    n.includes('results from') ||
    n.includes('account total')
  );
};

const detectRowLevel = (record = {}, campaignName = '') => {
  if (isSummaryName(campaignName)) return 'account';

  if (hasTextByAliases(record, ['ad name', 'ad id', 'ad creative name'])) return 'ad';

  if (
    hasTextByAliases(record, [
      'ad set name',
      'adset name',
      'ad set',
      'adset',
      'ad group name',
      'ad group',
    ])
  ) {
    return 'ad_set';
  }

  return campaignName ? 'campaign' : 'unknown';
};

const detectResultType = (record = {}, conversionHeader = '') => {
  const explicit = getTextByAliases(record, [
    'result type',
    'results type',
    'result types',
    'conversion event',
    'conversion type',
    'action type',
    'actions',
    'objective result',
  ]);

  const headerText = normalizeText(conversionHeader);
  const valueText = normalizeText(explicit);
  const combined = [valueText, headerText].filter(Boolean).join(' ');

  if (!combined) return '';
  if (combined.includes('qualified') && combined.includes('lead')) return 'qualified_lead';
  if (combined.includes('lead') && (combined.includes('form') || combined.includes('onsite') || combined.includes('website'))) return 'lead_form';
  if (combined === 'lead' || combined === 'leads' || combined.includes(' lead')) return 'lead';
  if (combined.includes('purchase') || combined.includes('order')) return 'purchase';
  if (combined.includes('messaging conversation')) return 'messaging_conversation';
  if (combined.includes('landing page view')) return 'landing_page_view';
  if (combined.includes('install')) return 'app_install';

  return combined;
};

const isApprovedPrimaryResultType = (resultType = '', reportType = '') => {
  const type = normalizeText(resultType);

  if (!type) return true;
  if (type.includes('qualified') && type.includes('lead')) return false;

  if (reportType === 'lead_generation') {
    return (
      type === 'lead' ||
      type === 'leads' ||
      type.includes('lead form') ||
      type.includes('leads form') ||
      type.includes('form lead') ||
      type.includes('form leads') ||
      type.includes('onsite lead') ||
      type.includes('website lead')
    );
  }

  if (reportType === 'sales_campaign') {
    return type.includes('purchase') || type.includes('order');
  }

  if (reportType === 'traffic') {
    return type.includes('landing page view') || type.includes('click');
  }

  if (reportType === 'app') {
    return type.includes('install');
  }

  return true;
};

const normalizeResultBreakdown = (breakdown = {}) =>
  Object.entries(breakdown || {}).reduce((clean, [type, value]) => {
    const normalizedType = normalizeText(type).replace(/\s+/g, '_');
    const numericValue = Number(value);
    if (!normalizedType || !Number.isFinite(numericValue) || numericValue <= 0) return clean;
    clean[normalizedType] = (clean[normalizedType] || 0) + numericValue;
    return clean;
  }, {});

const mergeResultBreakdowns = (breakdowns = []) =>
  normalizeResultBreakdown(
    breakdowns.reduce((merged, breakdown) => {
      Object.entries(normalizeResultBreakdown(breakdown)).forEach(([type, value]) => {
        merged[type] = (merged[type] || 0) + value;
      });
      return merged;
    }, {})
  );

const uniqueResultTypes = (breakdown = {}, fallbackTypes = []) => {
  const types = new Set([
    ...Object.keys(normalizeResultBreakdown(breakdown)),
    ...fallbackTypes.map((type) => normalizeText(type).replace(/\s+/g, '_')).filter(Boolean),
  ]);

  return Array.from(types).sort();
};

const primaryResultValue = (breakdown = {}, reportType = '') =>
  Object.entries(normalizeResultBreakdown(breakdown)).reduce((sum, [type, value]) => {
    return isApprovedPrimaryResultType(type, reportType) ? sum + Number(value || 0) : sum;
  }, 0);

const getExplicitResultValue = (record = {}, parseNumber = Number, mappedValue = 0) => {
  const mapped = Number(mappedValue || 0);
  if (Number.isFinite(mapped) && mapped > 0) return mapped;

  const resultValueAliases = new Set([
    'results',
    'result',
    'leads',
    'lead',
    'purchases',
    'purchase',
    'conversions',
    'conversion',
  ]);

  for (const [key, value] of Object.entries(record || {})) {
    const normalizedKey = normalizeText(key);
    if (!resultValueAliases.has(normalizedKey)) continue;

    const parsed = Number(parseNumber(value));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return 0;
};

const rowLevelPriority = {
  campaign: 1,
  ad_set: 2,
  ad: 3,
  unknown: 4,
};

const selectCanonicalCampaignRows = (rows = []) => {
  const byMonthAndCampaign = new Map();

  for (const row of rows) {
    const monthKey = row.reportMonth?.toISOString?.().slice(0, 10) || 'unknown';
    const campaignKey = String(row.name || '').trim().toLowerCase();
    const key = `${monthKey}::${campaignKey}`;
    const current = byMonthAndCampaign.get(key) || [];
    current.push(row);
    byMonthAndCampaign.set(key, current);
  }

  return Array.from(byMonthAndCampaign.values()).flatMap((campaignRows) => {
    const bestLevel = campaignRows.reduce((selected, row) => {
      const currentPriority = rowLevelPriority[row.rowLevel] || rowLevelPriority.unknown;
      const selectedPriority = rowLevelPriority[selected] || rowLevelPriority.unknown;
      return currentPriority < selectedPriority ? row.rowLevel : selected;
    }, 'unknown');

    return campaignRows.filter((row) => (row.rowLevel || 'unknown') === bestLevel);
  });
};

const preferredAggregateSourceRows = ({ summaryRows = [], detailRows = [], useCampaignRowsForMonthlyAggregate = false }) => {
  if (summaryRows.length && !useCampaignRowsForMonthlyAggregate) return summaryRows;

  const byMonth = new Map();
  for (const row of detailRows) {
    const monthKey = row.reportMonth?.toISOString?.().slice(0, 10) || 'unknown';
    const current = byMonth.get(monthKey) || [];
    current.push(row);
    byMonth.set(monthKey, current);
  }

  return Array.from(byMonth.values()).flatMap((monthRows) => {
    const bestLevel = monthRows.reduce((selected, row) => {
      const currentPriority = rowLevelPriority[row.rowLevel] || rowLevelPriority.unknown;
      const selectedPriority = rowLevelPriority[selected] || rowLevelPriority.unknown;
      return currentPriority < selectedPriority ? row.rowLevel : selected;
    }, 'unknown');

    return monthRows.filter((row) => (row.rowLevel || 'unknown') === bestLevel);
  });
};

module.exports = {
  normalizeText,
  isSummaryName,
  detectRowLevel,
  detectResultType,
  getExplicitResultValue,
  isApprovedPrimaryResultType,
  mergeResultBreakdowns,
  normalizeResultBreakdown,
  primaryResultValue,
  selectCanonicalCampaignRows,
  uniqueResultTypes,
  preferredAggregateSourceRows,
};
