const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DICTIONARY_ROOT = __dirname;

const normalizeMetricText = (value = '') =>
  String(value)
    .toLowerCase()
    .replace(/[₹$€£()[\]{}.,:%/_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const dictionaryCache = new Map();

const PLATFORM_FILES = {
  meta: path.join(DICTIONARY_ROOT, 'meta', 'Meta_Metric_Dictionary.xlsx'),
  google: path.join(DICTIONARY_ROOT, 'google', 'Google_Metric_Dictionary.xlsx'),
  linkedin: path.join(DICTIONARY_ROOT, 'linkedin', 'LinkedIn_Metric_Dictionary.xlsx'),
};

const findHeaderRow = (rows) =>
  rows.findIndex((row) =>
    row.some((cell) => normalizeMetricText(cell) === 'field name exact meta label')
  );

const classifyInternalField = (entry) => {
  const name = normalizeMetricText(entry.fieldName);
  const bucket = normalizeMetricText(entry.businessBucket);
  const fieldType = normalizeMetricText(entry.fieldType);

  if (['campaign', 'campaign name'].includes(name)) return 'campaignName';
  if (name === 'amount spent' || name === 'spend') return 'spend';
  if (name === 'impressions' || name === 'impression') return 'impressions';
  if (name === 'reach') return 'reach';
  if (name === 'clicks all' || name === 'clicks' || name === 'link clicks' || name === 'outbound clicks') return 'clicks';
  if (name.includes('ctr') || name.includes('click through rate')) return 'ctr';
  if (name === 'cpc' || name.includes('cost per click')) return 'cpc';
  if (name.includes('roas') || fieldType.includes('roas')) return 'roas';
  if (fieldType.includes('conversion value') || name.includes('revenue')) return 'revenue';
  if (name.includes('cost per') || fieldType.includes('cost per result')) return 'cpa';
  if (name.includes('follow')) return 'followers';

  const isAdditiveCount = fieldType.includes('count raw additive');
  if (!isAdditiveCount) return null;

  if (bucket === 'leads') return 'conversions';
  if (bucket === 'sales e commerce' && (name.includes('purchase') || name.includes('order'))) return 'conversions';
  if (bucket === 'app' && name.includes('install')) return 'conversions';
  if (bucket === 'traffic' && name.includes('landing page view')) return 'conversions';
  if (bucket === 'engagement' && name.includes('engagement')) return 'conversions';
  if (name === 'results' || name === 'result') return 'conversions';

  return null;
};

const isAdditiveMetric = (entry) => {
  const type = normalizeMetricText(entry.fieldType);
  const aggregation = normalizeMetricText(entry.aggregationRule);

  return (
    type.includes('count raw additive') ||
    type.includes('conversion value') ||
    aggregation.includes('sum safely')
  );
};

const isDerivedMetric = (entry) => {
  const type = normalizeMetricText(entry.fieldType);
  const name = normalizeMetricText(entry.fieldName);

  return (
    type.includes('derived') ||
    type.includes('rate') ||
    name.includes('ctr') ||
    name.includes('cpc') ||
    name.includes('cpa') ||
    name.includes('cpl') ||
    name.includes('cpp') ||
    name.includes('roas') ||
    name.includes('cost per') ||
    name.includes('conversion rate')
  );
};

const parseWorkbookDictionary = (filePath, platform) => {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames.find((name) =>
    normalizeMetricText(name).includes('metric dictionary')
  ) || workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
  });

  const headerIndex = findHeaderRow(rows);
  if (headerIndex === -1) {
    throw new Error(`Metric dictionary header row not found for ${platform}`);
  }

  const headers = rows[headerIndex].map((header) => String(header || '').trim());
  const entries = rows
    .slice(headerIndex + 1)
    .map((row) => {
      const obj = Object.fromEntries(headers.map((header, index) => [header, row[index]]));

      const entry = {
        platform,
        fieldName: String(obj['Field Name (exact Meta label)'] || '').trim(),
        group: String(obj['Meta Group / Tab'] || '').trim(),
        businessBucket: String(obj['Business Bucket'] || '').trim(),
        fieldType: String(obj['Field Type'] || '').trim(),
        aggregationRule: String(obj['How Your System Should Aggregate It'] || '').trim(),
        description: String(obj.Description || '').trim(),
      };

      return {
        ...entry,
        normalizedName: normalizeMetricText(entry.fieldName),
        normalizedBucket: normalizeMetricText(entry.businessBucket),
        internalField: classifyInternalField(entry),
        isAdditive: isAdditiveMetric(entry),
        isDerived: isDerivedMetric(entry),
      };
    })
    .filter((entry) => entry.fieldName);

  return {
    platform,
    filePath,
    entries,
    byNormalizedName: new Map(entries.map((entry) => [entry.normalizedName, entry])),
  };
};

const loadMetricDictionary = (platform = 'meta') => {
  const key = normalizeMetricText(platform) || 'meta';
  if (dictionaryCache.has(key)) return dictionaryCache.get(key);

  const filePath = PLATFORM_FILES[key];
  if (!filePath || !fs.existsSync(filePath)) {
    const empty = { platform: key, filePath: null, entries: [], byNormalizedName: new Map() };
    dictionaryCache.set(key, empty);
    return empty;
  }

  const dictionary = parseWorkbookDictionary(filePath, key);
  dictionaryCache.set(key, dictionary);
  return dictionary;
};

const findDictionaryEntryForHeader = (header, dictionary) => {
  const normalizedHeader = normalizeMetricText(header);
  if (!normalizedHeader) return null;

  const exact = dictionary.byNormalizedName.get(normalizedHeader);
  if (exact) return exact;

  return dictionary.entries.find((entry) => {
    if (!entry.normalizedName) return false;
    return normalizedHeader.includes(entry.normalizedName) || entry.normalizedName.includes(normalizedHeader);
  }) || null;
};

const mappingPriority = (entry, header) => {
  const name = normalizeMetricText(entry.fieldName);
  const headerText = normalizeMetricText(header);
  let score = 10;

  if (headerText === name) score += 20;
  if (name.includes('website')) score += 8;
  if (name.includes('meta')) score += 6;
  if (name.includes('purchase') || name.includes('lead')) score += 12;
  if (name.includes('conversion value') || name.includes('revenue')) score += 12;
  if (name === 'results' || name === 'result') score -= 20;
  if (entry.internalField === 'spend' || entry.internalField === 'impressions' || entry.internalField === 'reach') score += 10;
  if (entry.isDerived) score -= 5;

  return score;
};

const suggestMetricMappingFromDictionary = (headers = [], platform = 'meta') => {
  const dictionary = loadMetricDictionary(platform);
  const mapping = {};
  const matchedColumns = {};
  const mappingScores = {};

  headers.forEach((header) => {
    const entry = findDictionaryEntryForHeader(header, dictionary);
    if (!entry) return;

    matchedColumns[header] = {
      fieldName: entry.fieldName,
      businessBucket: entry.businessBucket,
      fieldType: entry.fieldType,
      aggregation: entry.isDerived ? 'RECALCULATE' : entry.isAdditive ? 'SUM' : 'DIMENSION',
      internalField: entry.internalField,
    };

    if (!entry.internalField) return;
    const priority = mappingPriority(entry, header);
    if (mapping[entry.internalField] && priority <= (mappingScores[entry.internalField] || 0)) return;

    mapping[entry.internalField] = header;
    mappingScores[entry.internalField] = priority;
  });

  return {
    mapping,
    matchedColumns,
    dictionary,
  };
};

const detectReportTypeFromDictionary = (headers = [], mapping = {}, platform = 'meta') => {
  const dictionary = loadMetricDictionary(platform);
  const sourceLabels = [
    ...headers,
    ...Object.keys(mapping || {}),
    ...Object.values(mapping || {}),
  ];

  const matchedEntries = sourceLabels
    .map((label) => findDictionaryEntryForHeader(label, dictionary))
    .filter(Boolean);

  const score = (bucket) =>
    matchedEntries.filter((entry) => entry.normalizedBucket === normalizeMetricText(bucket)).length;

  const salesScore =
    score('Sales / E-commerce') +
    matchedEntries.filter((entry) => entry.internalField === 'revenue' || entry.internalField === 'roas').length;
  const leadScore = score('Leads');
  const trafficScore = score('Traffic');
  const engagementScore = score('Engagement');
  const appScore = score('App');

  if (salesScore > 0 && salesScore >= leadScore) return 'sales_campaign';
  if (leadScore > 0) return 'lead_generation';
  if (appScore > 0) return 'app';
  if (trafficScore > engagementScore && trafficScore > 0) return 'traffic';
  if (engagementScore > 0) return 'engagement';

  return null;
};

const getDictionaryRequiredMetricFields = (reportType = 'needs_review') => {
  if (reportType === 'sales_campaign') return ['spend', 'conversions'];
  if (reportType === 'lead_generation') return ['spend', 'conversions'];
  if (reportType === 'traffic') return ['spend', 'clicks'];
  if (reportType === 'engagement') return ['spend', 'conversions'];
  if (reportType === 'app') return ['spend', 'conversions'];
  return ['spend', 'impressions', 'clicks', 'conversions', 'revenue'];
};

module.exports = {
  normalizeMetricText,
  loadMetricDictionary,
  suggestMetricMappingFromDictionary,
  detectReportTypeFromDictionary,
  getDictionaryRequiredMetricFields,
};
