const fs = require('fs');
const path = require('path');

// Parse CSV/Excel data and extract marketing metrics
const extractFromCSV = async (filePath, reportType = 'ads') => {
  const { parse } = require('csv-parse/sync');
  const content = fs.readFileSync(filePath, 'utf8');
  const records = parse(content, { columns: true, skip_empty_lines: true });
  return parseMarketingData(records, reportType);
};

const extractFromExcel = async (filePath, reportType = 'ads') => {
  const XLSX = require('xlsx');
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
  });

  // Find actual header row
const headerIndex = rows.findIndex(row => {
  const text = row.map(cell => normalizeHeader(cell)).join(' ');

  return (
    text.includes('campaign') ||
    text.includes('date') ||
    text.includes('order') ||
    text.includes('revenue') ||
    text.includes('sales') ||
    text.includes('spend') ||
    text.includes('cost') ||
    text.includes('click') ||
    text.includes('impression') ||
    text.includes('lead') ||
    text.includes('roas') ||
    text.includes('quantity') ||
    text.includes('qty') ||
    text.includes('profit') ||
    text.includes('margin') ||
    text.includes('refund')
  );
});

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

 return parseMarketingData(records, reportType);
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

const ADS_COLUMN_MAP = {
  spend: [
    'spend',
    'amount spent',
    'amount spent inr',
    'amount spent (inr)',
    'ad spend',
    'ads spend',
    'meta spend',
    'meta spends',
    'total spend',
    'total spent',
    'marketing spend',
  ],

  impressions: [
    'impressions',
    'impression',
    'total impressions',
    'views',
    'ad views',
  ],

  clicks: [
    'clicks',
    'link clicks',
    'website clicks',
    'outbound clicks',
    'all clicks',
    'unique clicks',
  ],

  ctr: [
    'ctr',
    'click through rate',
    'click-through rate',
    'ctr (%)',
  ],

  cpc: [
    'cpc',
    'cost per click',
    'average cpc',
    'avg cpc',
  ],

  conversions: [
    'leads',
    'lead',
    'results',
    'result',
    'conversions',
    'conversion',
    'website leads',
  ],

  cpa: [
    'cost per result',
    'cost per lead',
    'cost per conversion',
    'cpa',
  ],

  roas: [
    'roas',
    'return on ad spend',
    'purchase roas',
  ],

  revenue: [
    'website revenue',
    'website revenue (₹)',
    'purchase value',
    'conversion value',
    'website purchase value',
    'meta reported revenue',
    'meta reported revenue (₹)',
  ],

  reach: [
    'reach',
    'unique reach',
  ],

  followers: [
    'followers',
    'ig follows',
    'instagram followers',
    'new followers',
    'follows',
  ],

  campaignName: [
    'campaign',
    'campaign name',
    'campaign_name',
    'ad campaign',
  ],

  platform: [
    'platform',
    'channel',
    'network',
    'source',
  ],
};

const SALES_COLUMN_MAP = {
  revenue: [
    'revenue',
    'sales',
    'total sales',
    'gross sales',
    'net sales',
    'sales revenue',
    'total revenue',
    'order revenue',
    'sale amount',
  ],

  orders: [
    'orders',
    'order',
    'total orders',
    'order count',
    'number of orders',
    'purchases',
    'purchase count',
  ],

  quantity: [
    'quantity',
    'qty',
    'units sold',
    'items sold',
    'item quantity',
    'total quantity',
  ],

  refunds: [
    'refund',
    'refunds',
    'returns',
    'returned amount',
    'refund amount',
  ],

  profit: [
    'profit',
    'gross profit',
    'net profit',
    'total profit',
  ],

  margin: [
    'margin',
    'profit margin',
    'gross margin',
    'net margin',
  ],

  aov: [
    'aov',
    'average order value',
    'avg order value',
  ],

  product: [
    'product',
    'product name',
    'item',
    'item name',
    'sku',
  ],

  category: [
    'category',
    'product category',
  ],

  channel: [
    'channel',
    'sales channel',
    'source',
    'platform',
  ],

  date: [
    'date',
    'order date',
    'created date',
    'sales date',
  ],
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
const COLUMN_MAP = ADS_COLUMN_MAP;

const normalizeHeader = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[₹$€£%()_\-./]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const similarity = (a, b) => {
  a = normalizeHeader(a);
  b = normalizeHeader(b);

  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;

  const aWords = new Set(a.split(' '));
  const bWords = new Set(b.split(' '));

  let match = 0;
  bWords.forEach((word) => {
    if (aWords.has(word)) match++;
  });

  return match / Math.max(bWords.size, 1);
};

const findColumn = (headers, fieldVariants, fieldName) => {
  const lowerHeaders = headers.map(h => normalizeHeader(h));

  for (const variant of fieldVariants) {
    const v = normalizeHeader(variant);

    let idx = lowerHeaders.indexOf(v);
    if (idx !== -1) return headers[idx];

    idx = lowerHeaders.findIndex(h => h.includes(v));
    if (idx !== -1) return headers[idx];
  }

  const keywordRules = {
    spend: /(amount spent|spend|spent|budget|ad spend|marketing spend)/,
    revenue: /(revenue|sales|income|earning|purchase value|conversion value)/,
    conversions: /(lead|leads|conversion|conversions|result|results)/,
    clicks: /(click|clicks|tap|taps)/,
    impressions: /(impression|impressions|views|ad views)/,
    reach: /(reach)/,
    followers: /(followers|follows|ig follows|instagram follows)/,
  };

  const rule = keywordRules[fieldName];

  if (!rule) return null;

  for (let i = 0; i < lowerHeaders.length; i++) {
    if (rule.test(lowerHeaders[i])) {
      return headers[i];
    }
  }

  return null;
};
const parseNum = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  const str = val.toString().replace(/[$₹€£,%]/g, '').replace(/,/g, '').trim();
  return parseFloat(str) || 0;
};

 const resolveMapForType = (reportType) => {
   return reportType === 'sales' ? SALES_COLUMN_MAP : ADS_COLUMN_MAP;
 };

 const buildColumnMap = (headers, reportType = 'ads') => {
   const sourceMap = resolveMapForType(reportType);
   const colMap = {};

   for (const [field, variants] of Object.entries(sourceMap)) {
     colMap[field] = findColumn(headers, variants, field);
   }

   return colMap;
 };

 const parseMarketingData = (records, reportType = 'ads') => {
   if (!records || !records.length) {
     return { metrics: {}, campaigns: [], rawText: '', reportType };
   }

   const headers = Object.keys(records[0]);
   const colMap = buildColumnMap(headers, reportType);

   const campaigns = [];

   if (reportType === 'sales') {
     let totalRevenue = 0;
     let totalOrders = 0;
     let totalQuantity = 0;
     let totalRefunds = 0;
     let totalProfit = 0;

     for (const record of records) {
       const revenue = parseNum(colMap.revenue ? record[colMap.revenue] : 0);
       const orders = parseNum(colMap.orders ? record[colMap.orders] : 0);
       const quantity = parseNum(colMap.quantity ? record[colMap.quantity] : 0);
       const refunds = parseNum(colMap.refunds ? record[colMap.refunds] : 0);
       const profit = parseNum(colMap.profit ? record[colMap.profit] : 0);

       const margin =
         colMap.margin
           ? parseNum(record[colMap.margin])
           : revenue > 0
           ? (profit / revenue) * 100
           : 0;

       const aov =
         colMap.aov
           ? parseNum(record[colMap.aov])
           : orders > 0
           ? revenue / orders
           : 0;

       totalRevenue += revenue;
       totalOrders += orders;
       totalQuantity += quantity;
       totalRefunds += refunds;
       totalProfit += profit;

       campaigns.push({
         name:
           (colMap.product && record[colMap.product]) ||
           (colMap.category && record[colMap.category]) ||
           'Sales Item',
         platform:
           colMap.channel && record[colMap.channel]
             ? String(record[colMap.channel]).toLowerCase()
             : 'sales',
         revenue,
         orders,
         quantity,
         refunds,
         profit,
         margin,
         aov,
         rawData: record,
       });
     }

     const metrics = {
       revenue: totalRevenue,
       orders: totalOrders,
       quantity: totalQuantity,
       refunds: totalRefunds,
       profit: totalProfit,
       aov: totalOrders > 0 ? totalRevenue / totalOrders : 0,
       margin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
     };

     return {
       metrics,
       campaigns,
       rawText: '',
       reportType: 'sales',
     };
   }

   let totalSpend = 0;
   let totalImpressions = 0;
   let totalClicks = 0;
   let totalConversions = 0;
   let totalRevenue = 0;
   let totalReach = 0;
   let totalFollowers = 0;

   for (const record of records) {
     const spend = parseNum(colMap.spend ? record[colMap.spend] : 0);
     const impressions = parseNum(colMap.impressions ? record[colMap.impressions] : 0);
     const clicks = parseNum(colMap.clicks ? record[colMap.clicks] : 0);
     const conversions = parseNum(colMap.conversions ? record[colMap.conversions] : 0);
     const revenue = parseNum(colMap.revenue ? record[colMap.revenue] : 0);
     const reach = parseNum(colMap.reach ? record[colMap.reach] : 0);
     const followers = parseNum(colMap.followers ? record[colMap.followers] : 0);

     totalSpend += spend;
     totalImpressions += impressions;
     totalClicks += clicks;
     totalConversions += conversions;
     totalRevenue += revenue;
     totalReach += reach;
     totalFollowers += followers;

     campaigns.push({
       name: colMap.campaignName ? record[colMap.campaignName] : 'Campaign',
       platform: colMap.platform ? String(record[colMap.platform] || 'meta').toLowerCase() : 'meta',
       spend,
       impressions,
       clicks,
       ctr: colMap.ctr ? parseNum(record[colMap.ctr]) : impressions > 0 ? (clicks / impressions) * 100 : 0,
       cpc: colMap.cpc ? parseNum(record[colMap.cpc]) : clicks > 0 ? spend / clicks : 0,
       conversions,
       cpa: colMap.cpa ? parseNum(record[colMap.cpa]) : conversions > 0 ? spend / conversions : 0,
       roas: colMap.roas ? parseNum(record[colMap.roas]) : spend > 0 ? revenue / spend : 0,
       revenue,
       reach,
       followers,
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
     followers: totalFollowers,
   };

   return {
     metrics,
     campaigns,
     rawText: '',
     reportType: 'ads',
   };
 };

module.exports = {
  extractFromCSV,
  extractFromExcel,
  extractFromPDF,
  extractFromImage,
  COLUMN_MAP,
  ADS_COLUMN_MAP,
  SALES_COLUMN_MAP,
  normalizeHeader,
  parseNum,
  parseMarketingData,
  buildColumnMap,
};
