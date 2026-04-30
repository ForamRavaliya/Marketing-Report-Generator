const fs = require('fs');
const path = require('path');

// Parse CSV/Excel data and extract marketing metrics
const extractFromCSV = async (filePath) => {
  const { parse } = require('csv-parse/sync');
  const content = fs.readFileSync(filePath, 'utf8');
  const records = parse(content, { columns: true, skip_empty_lines: true });
  return parseMarketingData(records);
};

const extractFromExcel = async (filePath) => {
  const XLSX = require('xlsx');
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
  });

  // Find actual header row
  const headerIndex = rows.findIndex(row =>
    row.some(cell =>
      String(cell).toLowerCase().trim() === 'campaign name'
    )
  );

  if (headerIndex === -1) {
    console.log('Excel headers not found');
    return { metrics: {}, campaigns: [], rawText: '' };
  }

  const headers = rows[headerIndex].map(h => String(h).trim());

  const records = rows.slice(headerIndex + 1)
    .filter(row => row.some(cell => String(cell).trim() !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        if (h) obj[h] = row[i];
      });
      return obj;
    });

  return parseMarketingData(records);
};
const extractFromPDF = async (filePath) => {
  try {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return extractFromText(data.text);
  } catch (error) {
    console.error('PDF extraction error:', error);
    return { metrics: {}, campaigns: [], rawText: '' };
  }
};

const extractFromImage = async (filePath) => {
  try {
    const Tesseract = require('tesseract.js');
    const { data: { text } } = await Tesseract.recognize(filePath, 'eng', {
      logger: () => {},
    });
    return extractFromText(text);
  } catch (error) {
    console.error('OCR extraction error:', error);
    return { metrics: {}, campaigns: [], rawText: '' };
  }
};

// Parse raw text (from PDF/OCR) for marketing metrics
const extractFromText = (text) => {
  const metrics = {};
  const patterns = {
    spend: /(?:spend|budget|cost|amount spent)[:\s]+[$₹€£]?\s*([\d,]+\.?\d*)/gi,
    impressions: /(?:impressions?|views?)[:\s]+([\d,]+)/gi,
    clicks: /(?:clicks?|link clicks?)[:\s]+([\d,]+)/gi,
    ctr: /(?:ctr|click.through.rate)[:\s]+([\d.]+)\s*%?/gi,
    cpc: /(?:cpc|cost.per.click)[:\s]+[$₹€£]?\s*([\d.]+)/gi,
    conversions: /(?:conversions?|leads?|results?)[:\s]+([\d,]+)/gi,
    cpa: /(?:cpa|cost.per.(?:acquisition|conversion|lead|result))[:\s]+[$₹€£]?\s*([\d.]+)/gi,
    roas: /(?:roas|return.on.ad.spend)[:\s]+([\d.]+)/gi,
    reach: /(?:reach)[:\s]+([\d,]+)/gi,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = pattern.exec(text);
    if (match) {
      metrics[key] = parseFloat(match[1].replace(/,/g, ''));
    }
  }

  // Try to extract date range
  const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s*(?:to|[-–])\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i;
  const dateMatch = datePattern.exec(text);
  if (dateMatch) {
    metrics.dateRangeStart = new Date(dateMatch[1]);
    metrics.dateRangeEnd = new Date(dateMatch[2]);
  }

  return { metrics, campaigns: [], rawText: text };
};

// Map various column name formats to standard fields
const COLUMN_MAP = {
  spend: ['spend', 'amount spent', 'cost', 'budget used', 'total spend', 'amount_spent', 'cost_usd', 'spend_usd'],
  impressions: ['impressions', 'impr', 'impressions.', 'total impressions'],
  clicks: ['clicks', 'link clicks', 'click', 'total clicks', 'all clicks', 'website clicks'],
  ctr: ['ctr', 'click-through rate', 'click through rate', 'ctr (%)', 'link ctr'],
  cpc: ['cpc', 'cost per click', 'avg. cpc', 'average cpc', 'cost_per_click'],
  conversions: ['conversions', 'leads', 'results', 'actions', 'total conversions', 'purchase', 'purchases'],
  cpa: ['cpa', 'cost per result', 'cost per conversion', 'cost per lead', 'cost per acquisition', 'cost/conv.'],
  roas: ['roas', 'return on ad spend', 'purchase roas', 'website purchase roas', 'conv. value/cost'],
  revenue: ['revenue', 'conversion value', 'purchase value', 'total revenue', 'website purchase value'],
  reach: ['reach', 'unique reach', 'estimated total reach'],
  frequency: ['frequency', 'avg. frequency'],
  campaignName: ['campaign', 'campaign name', 'campaign_name', 'ad campaign', 'campaign title'],
  platform: ['platform', 'channel', 'network', 'source'],
  deliveryLevel: ['delivery level'],
  adSetName: ['ad set name'],
  resultType: ['result type'],
  starts: ['starts'],
  ends: ['ends'],
  reportingStarts: ['reporting starts'],
  reportingEnds: ['reporting ends'],
};

const findColumn = (headers, fieldVariants) => {
  const lowerHeaders = headers.map(h => h?.toString().toLowerCase().trim());

  for (const variant of fieldVariants) {
    const v = variant.toLowerCase();

    // exact match first
    let idx = lowerHeaders.indexOf(v);
    if (idx !== -1) return headers[idx];

    // partial match for columns like "Amount spent (INR)"
    idx = lowerHeaders.findIndex(h => h.includes(v));
    if (idx !== -1) return headers[idx];
  }

  return null;
};

const parseNum = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  const str = val.toString().replace(/[$₹€£,%]/g, '').replace(/,/g, '').trim();
  return parseFloat(str) || 0;
};

const parseMarketingData = (records) => {
  if (!records || !records.length) return { metrics: {}, campaigns: [], rawText: '' };

  const headers = Object.keys(records[0]);
  const colMap = {};
  for (const [field, variants] of Object.entries(COLUMN_MAP)) {
    colMap[field] = findColumn(headers, variants);
  }

  const campaigns = [];
  let totalSpend = 0,
    totalImpressions = 0,
    totalClicks = 0,
    totalConversions = 0,
    totalRevenue = 0,
    totalReach = 0;

  for (const record of records) {
  const deliveryLevel = colMap.deliveryLevel
    ? String(record[colMap.deliveryLevel] || '').toLowerCase().trim()
    : '';

  if (deliveryLevel !== 'campaign') {
    continue;
  }
    const spend = parseNum(colMap.spend ? record[colMap.spend] : 0);
    const impressions = parseNum(colMap.impressions ? record[colMap.impressions] : 0);
    const clicks = parseNum(colMap.clicks ? record[colMap.clicks] : 0);
    const conversions = parseNum(colMap.conversions ? record[colMap.conversions] : 0);
    const revenue = parseNum(colMap.revenue ? record[colMap.revenue] : 0);
    const reach = parseNum(colMap.reach ? record[colMap.reach] : 0);
    totalSpend += spend;
    totalImpressions += impressions;
    totalClicks += clicks;
    totalConversions += conversions;
    totalRevenue += revenue;
    totalReach += reach;

    campaigns.push({
      name: colMap.campaignName ? record[colMap.campaignName] : 'Campaign',
      platform: colMap.platform ? record[colMap.platform]?.toLowerCase() : 'meta',
      spend,
      impressions,
      clicks,
      ctr: colMap.ctr ? parseNum(record[colMap.ctr]) : (impressions > 0 ? (clicks / impressions) * 100 : 0),
      cpc: colMap.cpc ? parseNum(record[colMap.cpc]) : (clicks > 0 ? spend / clicks : 0),
      conversions,
      cpa: colMap.cpa ? parseNum(record[colMap.cpa]) : (conversions > 0 ? spend / conversions : 0),
      roas: colMap.roas ? parseNum(record[colMap.roas]) : (spend > 0 ? revenue / spend : 0),
      revenue,
      reach,
      rawData: record,
    });
  }

  const metrics = {
    spend: totalSpend,
    impressions: totalImpressions,
    clicks: totalClicks,
    ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
    conversions: totalConversions,
    cpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
    roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
    revenue: totalRevenue,
    reach: totalReach,
  };

  return { metrics, campaigns, rawText: '' };
};

module.exports = { extractFromCSV, extractFromExcel, extractFromPDF, extractFromImage };
