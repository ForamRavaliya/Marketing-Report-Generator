const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { detectReportType } = require('../utils/reportType');

const {
  extractFromCSV,
  extractFromExcel,
  extractFromPDF,
  extractFromImage,
  COLUMN_MAP,
  normalizeHeader,

} = require('../utils/extractor');


const { parse } = require('csv-parse/sync');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../data/uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.csv', '.xlsx', '.xls', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

router.use(authenticate);

const getFileType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (ext === '.csv') return 'csv';
  if (['.xlsx', '.xls'].includes(ext)) return 'excel';
  if (['.png', '.jpg', '.jpeg'].includes(ext)) return 'image';
  return 'other';
};

const norm = (v) => normalizeHeader(v || '');

function getExcelHeaderInfo(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: '',
  });

  const headerIndex = rows.findIndex((row) => {
    const text = row.map((cell) => normalizeHeader(cell)).join(' ');

    return (
      text.includes('campaign') ||
      text.includes('date') ||
      text.includes('order') ||
      text.includes('revenue') ||
      text.includes('sales') ||
      text.includes('spend') ||
      text.includes('amount spent') ||
      text.includes('cost') ||
      text.includes('click') ||
      text.includes('impression') ||
      text.includes('lead') ||
      text.includes('result') ||
      text.includes('reach') ||
      text.includes('roas') ||
      text.includes('follow')
    );
  });

  if (headerIndex === -1) {
    return {
      rows,
      headerIndex: -1,
      headers: [],
      headerCells: [],
    };
  }

  const headerRow = rows[headerIndex];

  const headerCells = headerRow
    .map((cell, index) => ({
      name: String(cell || '').trim(),
      index,
    }))
    .filter((h) => h.name);

  return {
    rows,
    headerIndex,
    headers: headerCells.map((h) => h.name),
    headerCells,
  };
}

async function extractHeaders(filePath, fileType) {
  if (fileType === 'csv') {
    const content = fs.readFileSync(filePath, 'utf8');
    const records = parse(content, { skip_empty_lines: true });
    return (records[0] || []).map((h) => String(h).trim()).filter(Boolean);
  }

  if (fileType === 'excel') {
    const { headers } = getExcelHeaderInfo(filePath);
    return headers;
  }

  return [];
}

function suggestColumnMapping(headers, reportType = 'ads') {
  const mapping = {};

  const find = (words, excluded = []) => {
    const normalizedHeaders = headers.map((header) => ({
      header,
      normalized: norm(header),
    }));
    const aliases = words.map(norm);
    const exclusions = excluded.map(norm);
    const allowed = ({ normalized }) =>
      !exclusions.some((word) => normalized.includes(word));

    for (const alias of aliases) {
      const exact = normalizedHeaders.find(
        (item) => allowed(item) && item.normalized === alias
      );
      if (exact) return exact.header;
    }

    for (const alias of aliases) {
      const partial = normalizedHeaders.find(
        (item) => allowed(item) && item.normalized.includes(alias)
      );
      if (partial) return partial.header;
    }

    return undefined;
  };

  mapping.spend = find([
    'amount spent',
    'amount spent inr',
    'amount spent (inr)',
    'spend',
    'meta spends',
    'meta spend',
    'total spend',
    'total spent',
    'ad spend',
    'cost',
  ], ['cost per click', 'cost per result', 'cost per lead', 'cost per conversion']);

  mapping.revenue = find([
    'website revenue',
    'revenue',
    'sales revenue',
    'purchase value',
    'conversion value',
    'meta reported revenue',
    'total revenue',
  ]);

 if (reportType === 'sales_data') {
    mapping.orders = find([
      'orders',
      'order',
      'total orders',
      'order count',
      'number of orders',
      'purchases',
      'purchase count',
    ]);

    mapping.quantity = find([
      'quantity',
      'qty',
      'units sold',
      'items sold',
      'item quantity',
      'total quantity',
    ]);

    mapping.refunds = find([
      'refund',
      'refunds',
      'returns',
      'returned amount',
      'refund amount',
    ]);

    mapping.profit = find([
      'profit',
      'gross profit',
      'net profit',
      'total profit',
    ]);

    mapping.margin = find([
      'margin',
      'profit margin',
      'gross margin',
      'net margin',
    ]);

    mapping.aov = find([
      'aov',
      'average order value',
      'avg order value',
    ]);

    mapping.product = find([
      'product',
      'product name',
      'item',
      'item name',
      'sku',
    ]);

    return Object.fromEntries(
      Object.entries(mapping).filter(([, value]) => value)
    );
  }

  mapping.conversions = find([
    'results',
    'leads',
    'lead',
    'conversions',
    'conversion',
    'website leads',
    'messaging conversations started',
  ], ['cost per result', 'cost per conversion', 'cost per lead', 'cost per purchase']);

  mapping.clicks = find([
    'clicks',
    'link clicks',
    'website clicks',
    'outbound clicks',
    'all clicks',
    'unique clicks',
    'unique link clicks',
    'inline link clicks',
    'result clicks',
    'click',
  ], ['cost per click', 'click through rate', 'click-through rate']);

  mapping.impressions = find([
    'impressions',
    'impression',
    'delivery impressions',
    'reach impressions',
    'total impressions',
    'views',
  ], ['cost per 1000 impressions', 'cost per thousand impressions', 'cpm']);

  mapping.reach = find([
    'reach',
    'unique reach',
  ]);

  mapping.followers = find([
    'followers',
    'ig follows',
    'instagram followers',
    'new followers',
    'follows',
  ]);

  mapping.ctr = find([
    'ctr',
    'click through rate',
    'click-through rate',
    'ctr (%)',
  ]);

  mapping.cpc = find([
    'cpc',
    'cost per click',
    'average cpc',
    'avg cpc',
  ]);

  mapping.cpa = find([
    'cost per result',
    'cost per lead',
    'cost per conversion',
    'cpa',
  ]);

  mapping.roas = find([
    'roas',
    'return on ad spend',
    'purchase roas',
  ]);

  mapping.campaignName = find([
    'campaign name',
    'campaign',
  ]);

  Object.keys(mapping).forEach((key) => {
    if (!mapping[key]) delete mapping[key];
  });

  return mapping;
}

router.post('/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const {
      clientId,
      platform,
      dateRangeStart,
      dateRangeEnd,
    } = req.body;

    if (!clientId) return res.status(400).json({ error: 'Client ID required' });

    const fileType = getFileType(req.file.originalname);

    if (!['csv', 'excel'].includes(fileType)) {
      return res.status(400).json({
        error: 'Column mapping preview is currently supported for CSV and Excel files only',
      });
    }

    const clientCheck = await db.query(
      'SELECT id FROM clients WHERE id = $1 AND agency_id = $2',
      [clientId, req.user.agency_id]
    );

    if (!clientCheck.rows.length) {
      return res.status(403).json({ error: 'Client not found' });
    }

    const headers = await extractHeaders(req.file.path, fileType);
    const reportType = detectReportType(headers, {});
    const suggestedMapping = suggestColumnMapping(headers, reportType);

    const uploadResult = await db.query(
      `INSERT INTO report_uploads
       (
         client_id,
         uploaded_by,
         file_name,
         file_type,
         file_path,
         file_size,
         platform,
         date_range_start,
         date_range_end,
         report_type,
         extraction_status
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'mapping_required')
       RETURNING *`,
      [
        clientId,
        req.user.id,
        req.file.originalname,
        fileType,
        req.file.path,
        req.file.size,
        platform || 'meta',
        dateRangeStart || null,
        dateRangeEnd || null,
        reportType,
      ]
    );



    res.status(201).json({
      uploadId: uploadResult.rows[0].id,
      fileType,
      headers,
      reportType,
      suggestedMapping,
    });
  } catch (error) {
    console.error('Preview upload error:', error);
    res.status(500).json({ error: 'Failed to preview file' });
  }
});

function validateMapping(mapping) {
  const errors = [];

  const spendCol = norm(mapping.spend);
  const cpaCol = norm(mapping.cpa);
  const cpcCol = norm(mapping.cpc);

  if (spendCol.includes('cost per result') || spendCol.includes('cost per lead')) {
    errors.push('Spend cannot be mapped to Cost per result. Use Amount spent instead.');
  }

  if (cpcCol.includes('cost per result') || cpcCol.includes('cost per lead')) {
    errors.push('CPC cannot be mapped to Cost per result. Cost per result should be mapped to CPA.');
  }

  if (cpaCol.includes('amount spent')) {
    errors.push('CPA cannot be mapped to Amount spent.');
  }

  return errors;
}

router.get('/client/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;

    const clientCheck = await db.query(
      `SELECT id
       FROM clients
       WHERE id = $1 AND agency_id = $2`,
      [clientId, req.user.agency_id]
    );

    if (!clientCheck.rows.length) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const result = await db.query(
      `SELECT
         id,
         file_name,
         file_type,
         file_size,
         platform,
         extraction_status,
         extraction_error,
         created_at,
         date_range_start,
         date_range_end
       FROM report_uploads
       WHERE client_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [clientId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get uploads error:', error);
    res.status(500).json({ error: 'Failed to fetch uploads' });
  }
});

router.post('/:uploadId/confirm-mapping', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const { mapping } = req.body;

    if (!mapping || typeof mapping !== 'object') {
      return res.status(400).json({ error: 'Mapping is required' });
    }

    const mappingErrors = validateMapping(mapping);

    if (mappingErrors.length > 0) {
      return res.status(400).json({
        error: mappingErrors.join(' '),
        mappingErrors,
      });
    }

    const uploadResult = await db.query(
      `SELECT ru.*, c.agency_id
       FROM report_uploads ru
       JOIN clients c ON c.id = ru.client_id
       WHERE ru.id = $1 AND c.agency_id = $2`,
      [uploadId, req.user.agency_id]
    );

    if (!uploadResult.rows.length) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    const uploadRow = uploadResult.rows[0];

    for (const [targetField, sourceColumn] of Object.entries(mapping)) {
      if (!sourceColumn || sourceColumn === 'ignore') continue;

      await db.query(
        `INSERT INTO column_mappings
         (client_id, platform, target_field, source_column)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (client_id, platform, target_field)
         DO UPDATE SET
           source_column = EXCLUDED.source_column,
           created_at = NOW()`,
        [
          uploadRow.client_id,
          uploadRow.platform || 'meta',
          targetField,
          sourceColumn,
        ]
      );
    }

 await processFileWithMapping(
   uploadRow.id,
   uploadRow.file_type,
   uploadRow.file_path,
   uploadRow.file_name,
   uploadRow.client_id,
   uploadRow.platform,
   uploadRow.date_range_start,
   uploadRow.date_range_end,
   mapping,
   uploadRow.report_type
 );



    res.json({
      success: true,
      message: 'Mapping confirmed and data imported successfully',
    });
  } catch (error) {
    console.error('Confirm mapping error:', error);
    res.status(500).json({ error: 'Failed to confirm mapping' });
  }
});

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { clientId, platform, dateRangeStart, dateRangeEnd } = req.body;
  if (!clientId) return res.status(400).json({ error: 'Client ID required' });

  const fileType = getFileType(req.file.originalname);
  const filePath = req.file.path;

  try {
    const clientCheck = await db.query(
      'SELECT id FROM clients WHERE id = $1 AND agency_id = $2',
      [clientId, req.user.agency_id]
    );

    if (!clientCheck.rows.length) {
      return res.status(403).json({ error: 'Client not found' });
    }

const headers = ['csv', 'excel'].includes(fileType)
  ? await extractHeaders(filePath, fileType)
  : [];

const reportType = detectReportType(headers, {});

    const uploadResult = await db.query(
      `INSERT INTO report_uploads
      (client_id, uploaded_by, file_name, file_type, file_path, file_size, platform, date_range_start, date_range_end, report_type, extraction_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'processing')
       RETURNING *`,
      [
        clientId,
        req.user.id,
        req.file.originalname,
        fileType,
        filePath,

        req.file.size,
        platform || 'meta',
        dateRangeStart || null,
        dateRangeEnd || null,
         reportType,
      ]
    );

    const uploadId = uploadResult.rows[0].id;

processFileWithMapping(
  uploadId,
  fileType,
  filePath,
  req.file.originalname,
  clientId,
  platform,
  dateRangeStart,
  dateRangeEnd,
  {},
  reportType
).catch((err) => console.error('FILE PROCESS ERROR:', err));

    res.status(201).json({
      uploadId,
      reportType,
      message: 'File uploaded. Extraction in progress.',
      fileType,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

async function buildRecordsFromMappedFile(filePath, fileType) {
  if (fileType === 'csv') {
    const content = fs.readFileSync(filePath, 'utf8');
    return parse(content, {
      columns: true,
      skip_empty_lines: true,
    });
  }

  if (fileType === 'excel') {
    const { rows, headerIndex, headerCells } = getExcelHeaderInfo(filePath);

    if (headerIndex === -1 || !headerCells.length) {
      throw new Error('Header row not found during mapped import');
    }

    return rows
      .slice(headerIndex + 1)
      .filter((row) => row.some((cell) => String(cell).trim() !== ''))
      .map((row) => {
        const obj = {};

        headerCells.forEach(({ name, index }) => {
          obj[name] = row[index];
        });

        return obj;
      });
  }

  throw new Error('Mapped import supports only CSV and Excel');
}


async function processFileWithMapping(
  uploadId,
  fileType,
  filePath,
  originalFileName,
  clientId,
  platform,
  dateStart,
  dateEnd,
  mapping,
  existingReportType = null
) {
  let transactionClient = null;

  try {
    const records = await buildRecordsFromMappedFile(filePath, fileType);

    const inferDateRangeFromFileName = (fileName = '') => {
      const text = String(fileName);

      const monthMap = {
        jan: 0, january: 0,
        feb: 1, february: 1,
        mar: 2, march: 2,
        apr: 3, april: 3,
        may: 4,
        jun: 5, june: 5,
        jul: 6, july: 6,
        aug: 7, august: 7,
        sep: 8, sept: 8, september: 8,
        oct: 9, october: 9,
        nov: 10, november: 10,
        dec: 11, december: 11,
      };

      const match = text.match(
        /(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)[-\s_]*(\d{1,2})[-\s_,]*(\d{4}).*?(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)[-\s_]*(\d{1,2})[-\s_,]*(\d{4})/i
      );

      if (!match) return null;

      const startMonth = monthMap[match[1].toLowerCase()];
      const startDay = Number(match[2]);
      const startYear = Number(match[3]);

      const endMonth = monthMap[match[4].toLowerCase()];
      const endDay = Number(match[5]);
      const endYear = Number(match[6]);

      return {
        start: new Date(startYear, startMonth, startDay),
        end: new Date(endYear, endMonth, endDay),
      };
    };

    const inferredRange = inferDateRangeFromFileName(originalFileName);

    if (inferredRange && dateStart) {
      const selectedMonth = new Date(dateStart);
      selectedMonth.setDate(1);
      selectedMonth.setHours(0, 0, 0, 0);

      const fileMonth = new Date(inferredRange.start);
      fileMonth.setDate(1);
      fileMonth.setHours(0, 0, 0, 0);

      if (selectedMonth.getTime() !== fileMonth.getTime()) {
        throw new Error(
          `Selected date range does not match file name. File appears to be for ${fileMonth.toLocaleString('en-US', {
            month: 'long',
            year: 'numeric',
          })}.`
        );
      }
    }

    const finalDateStart = dateStart || inferredRange?.start || null;
    const finalDateEnd = dateEnd || inferredRange?.end || null;

    const reportMonth = finalDateStart ? new Date(finalDateStart) : new Date();
    reportMonth.setDate(1);
    reportMonth.setHours(0, 0, 0, 0);

    const normalizedPlatform = platform || 'meta';
    const availableHeaders = Object.keys(records[0] || {});
    const reportType = existingReportType || detectReportType(availableHeaders, mapping);

    const suggestedColumns = suggestColumnMapping(availableHeaders, reportType);
    const mappedFields =
      reportType === 'sales_data'
        ? [
            'product',
            'revenue',
            'orders',
            'quantity',
            'refunds',
            'profit',
            'margin',
            'aov',
          ]
        : [
            'campaignName',
            'spend',
            'impressions',
            'clicks',
            'conversions',
            'revenue',
            'ctr',
            'cpc',
            'cpa',
            'roas',
            'reach',
            'followers',
          ];

    const resolvedColumns = Object.fromEntries(
      mappedFields.map((field) => {
        const configured =
          mapping[field] || (field === 'campaignName' ? mapping.campaign : null);

        if (configured === 'ignore') return [field, null];

        const configuredHeader = configured
          ? availableHeaders.find(
              (header) => normalizeHeader(header) === normalizeHeader(configured)
            )
          : null;

        return [field, configuredHeader || suggestedColumns[field] || null];
      })
    );

    console.log(`[upload ${uploadId}] Detected mapped fields:`, {
      campaignName: resolvedColumns.campaignName,
      spend: resolvedColumns.spend,
      impressions: resolvedColumns.impressions,
      clicks: resolvedColumns.clicks,
      conversions: resolvedColumns.conversions,
      revenue: resolvedColumns.revenue,
    });

    const parseMappedNumber = (value) => {
      if (value === null || value === undefined || value === '') return 0;
      if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

      const text = String(value).trim();
      if (!text) return 0;

      const isNegative = /^\(.*\)$/.test(text);
      const parsed = Number.parseFloat(
        text.replace(/,/g, '').replace(/[^\d.+-]/g, '')
      );

      if (!Number.isFinite(parsed)) return 0;
      return isNegative ? -Math.abs(parsed) : parsed;
    };

    const getRawValue = (record, field) => {
      const col = resolvedColumns[field];
      if (!col) return '';

      if (record[col] !== undefined && record[col] !== null) {
        return record[col];
      }

      const wanted = normalizeHeader(col);

      const actualKey = Object.keys(record).find(
        (key) => normalizeHeader(key) === wanted
      );

      if (!actualKey) return '';

      return record[actualKey];
    };

    const getValue = (record, field) => {
      return parseMappedNumber(getRawValue(record, field));
    };

    const getText = (record, field) => {
      return String(getRawValue(record, field) || '').trim();
    };

    const isSummaryRow = (name) => {
      const n = normalizeHeader(name);

      return (
        n === 'all' ||
        n === 'total' ||
        n === 'overall' ||
        n === 'aggregate' ||
        n.includes('total results') ||
        n.includes('account total')
      );
    };

    const isInvalidCampaignName = (name) => {
      const n = normalizeHeader(name);
      return (
        !n ||
        n === 'unknown campaign' ||
        n === 'unknown camp' ||
        n === 'campaign name n/a' ||
        n === 'name n/a' ||
        n === 'n/a' ||
        n === 'na' ||
        n === 'not available'
      );
    };

const normalizeSalesMetric = (record) => {
  const revenue = getValue(record, 'revenue');
  const orders = getValue(record, 'orders');
  const quantity = getValue(record, 'quantity');
  const refunds = getValue(record, 'refunds');
  const profit = getValue(record, 'profit');

  const marginValue = getValue(record, 'margin');
  const aovValue = getValue(record, 'aov');

  const margin =
    marginValue > 0
      ? marginValue
      : revenue > 0
      ? (profit / revenue) * 100
      : 0;

  const aov =
    aovValue > 0
      ? aovValue
      : orders > 0
      ? revenue / orders
      : 0;

  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    cpc: 0,
    conversions: Math.round(orders || 0),
    cpa: 0,
    roas: 0,
    revenue,
    reach: 0,
    followers: 0,
    orders: Math.round(orders || 0),
    quantity: Math.round(quantity || 0),
    refunds,
    profit,
    margin,
    aov,
  };
};

    const normalizeCampaignMetric = (record) => {
      const spend = getValue(record, 'spend');
      const impressions = getValue(record, 'impressions');

      let clicks = getValue(record, 'clicks');

      const ctrValue = getValue(record, 'ctr');
      const cpcValue = getValue(record, 'cpc');

      let conversions = getValue(record, 'conversions');
      const cpaValue = getValue(record, 'cpa');

      let revenue = getValue(record, 'revenue');
      const roasValue = getValue(record, 'roas');

      const reach = getValue(record, 'reach');
      const followers = getValue(record, 'followers');

      if (!clicks) {
        if (impressions > 0 && ctrValue > 0) {
          clicks = (impressions * ctrValue) / 100;
        } else if (spend > 0 && cpcValue > 0) {
          clicks = spend / cpcValue;
        }
      }

      if (!conversions && spend > 0 && cpaValue > 0) {
        conversions = spend / cpaValue;
      }

      if (!revenue && spend > 0 && roasValue > 0) {
        revenue = spend * roasValue;
      }

      const ctr = impressions > 0 && clicks > 0 ? (clicks / impressions) * 100 : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;
      const cpa = conversions > 0 ? spend / conversions : 0;
      const roas = spend > 0 && revenue > 0 ? revenue / spend : 0;

    return {
      spend,
      impressions: Math.round(impressions || 0),
      clicks: Math.round(clicks || 0),
      ctr,
      cpc,
      conversions: Math.round(conversions || 0),
      cpa,
      roas,
      revenue,
      reach: Math.round(reach || 0),
      followers: Math.round(followers || 0),
    };
    };

    const rawCampaignRows = [];
    const summaryRows = [];
    const detailRowsForAggregate = [];

    for (const record of records) {
    const campaignName =
      reportType === 'sales_data'
        ? getText(record, 'product') || 'Sales Item'
        : getText(record, 'campaignName') || getText(record, 'campaign');

     const metrics =
       reportType === 'sales_data'
         ? normalizeSalesMetric(record)
         : normalizeCampaignMetric(record);

      const hasAnyData =
        metrics.spend ||
        metrics.impressions ||
        metrics.clicks ||
        metrics.conversions ||
        metrics.revenue ||
        metrics.reach ||
        metrics.followers ||
        metrics.orders ||
        metrics.quantity ||
        metrics.refunds ||
        metrics.profit;

      if (!hasAnyData) continue;

      if (isSummaryRow(campaignName)) {
        summaryRows.push({
          name: 'aggregate',
          metrics,
          rawData: record,
        });
      } else {
        detailRowsForAggregate.push({
          name: campaignName,
          metrics,
          rawData: record,
        });

        if (isInvalidCampaignName(campaignName)) continue;

        rawCampaignRows.push({
          name: campaignName,
          metrics,
          rawData: record,
        });
      }
    }

    const campaignsByName = new Map();

    for (const row of rawCampaignRows) {
      const key = row.name.trim().toLowerCase();
      const existing = campaignsByName.get(key) || {
        name: row.name.trim(),
       metrics: {
         spend: 0,
         impressions: 0,
         clicks: 0,
         conversions: 0,
         revenue: 0,
         reach: 0,
         followers: 0,
         orders: 0,
         quantity: 0,
         refunds: 0,
         profit: 0,
       },
        rawData: [],
      };

      existing.metrics.spend += row.metrics.spend;
      existing.metrics.impressions += row.metrics.impressions;
      existing.metrics.clicks += row.metrics.clicks;
      existing.metrics.conversions += row.metrics.conversions;
      existing.metrics.revenue += row.metrics.revenue;
      existing.metrics.reach += row.metrics.reach;
      existing.metrics.followers += row.metrics.followers;
      existing.metrics.orders += row.metrics.orders || 0;
      existing.metrics.quantity += row.metrics.quantity || 0;
      existing.metrics.refunds += row.metrics.refunds || 0;
      existing.metrics.profit += row.metrics.profit || 0;
      existing.rawData.push(row.rawData);
      campaignsByName.set(key, existing);
    }

    const campaignRows = Array.from(campaignsByName.values()).map((row) => {
      const metrics = row.metrics;

      metrics.ctr = metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0;
      metrics.cpc = metrics.clicks > 0 ? metrics.spend / metrics.clicks : 0;
      metrics.cpa = metrics.conversions > 0 ? metrics.spend / metrics.conversions : 0;
      metrics.roas = metrics.spend > 0 ? metrics.revenue / metrics.spend : 0;

      return row;
    });

    const rowsForAggregate = summaryRows.length > 0 ? summaryRows : detailRowsForAggregate;

    const aggregate = rowsForAggregate.reduce(
      (acc, row) => {
        acc.spend += row.metrics.spend;
        acc.impressions += row.metrics.impressions;
        acc.clicks += row.metrics.clicks;
        acc.conversions += row.metrics.conversions;
        acc.revenue += row.metrics.revenue;
       acc.reach += row.metrics.reach;
       acc.followers += row.metrics.followers || 0;
       acc.orders += row.metrics.orders || 0;
        acc.quantity += row.metrics.quantity || 0;
        acc.refunds += row.metrics.refunds || 0;
        acc.profit += row.metrics.profit || 0;
        return acc;
      },
      {
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
        reach: 0,
        followers: 0,
        orders: 0,
        quantity: 0,
        refunds: 0,
        profit: 0,
      }
    );

    aggregate.ctr =
      aggregate.impressions > 0 && aggregate.clicks > 0
        ? (aggregate.clicks / aggregate.impressions) * 100
        : 0;

    aggregate.cpc =
      aggregate.clicks > 0 ? aggregate.spend / aggregate.clicks : 0;

    aggregate.cpa =
      aggregate.conversions > 0 ? aggregate.spend / aggregate.conversions : 0;

    aggregate.roas =
      aggregate.spend > 0 && aggregate.revenue > 0
        ? aggregate.revenue / aggregate.spend
        : 0;

        aggregate.aov = aggregate.orders > 0 ? aggregate.revenue / aggregate.orders : 0;
        aggregate.margin = aggregate.revenue > 0 ? (aggregate.profit / aggregate.revenue) * 100 : 0;

    transactionClient = await db.getClient();
    await transactionClient.query('BEGIN');
    await transactionClient.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`${clientId}:${normalizedPlatform}:${reportMonth.toISOString().slice(0, 10)}`]
    );

    await transactionClient.query(
      `DELETE FROM performance_data
       WHERE client_id = $1
       AND platform = $2
       AND report_month = $3`,
      [clientId, normalizedPlatform, reportMonth]
    );

    await transactionClient.query(
      `INSERT INTO performance_data
        (client_id, upload_id, platform, external_campaign_name, report_month, date_range_start, date_range_end,
         spend, impressions, clicks, ctr, cpc, conversions, cpa, roas, revenue, reach, followers, report_type, raw_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (client_id, platform, external_campaign_name, report_month)
       DO UPDATE SET
         upload_id = EXCLUDED.upload_id,
         date_range_start = EXCLUDED.date_range_start,
         date_range_end = EXCLUDED.date_range_end,
         spend = EXCLUDED.spend,
         impressions = EXCLUDED.impressions,
         clicks = EXCLUDED.clicks,
         ctr = EXCLUDED.ctr,
         cpc = EXCLUDED.cpc,
         conversions = EXCLUDED.conversions,
         cpa = EXCLUDED.cpa,
         roas = EXCLUDED.roas,
         revenue = EXCLUDED.revenue,
         reach = EXCLUDED.reach,
         followers = EXCLUDED.followers,
         report_type = EXCLUDED.report_type,
         raw_data = EXCLUDED.raw_data,
         updated_at = NOW()`,
      [
        clientId,
        uploadId,
        normalizedPlatform,
        'aggregate',
        reportMonth,
        finalDateStart,
        finalDateEnd,
        aggregate.spend,
        aggregate.impressions,
        aggregate.clicks,
        aggregate.ctr,
        aggregate.cpc,
        aggregate.conversions,
        aggregate.cpa,
        aggregate.roas,
        aggregate.revenue,
        aggregate.reach,
        aggregate.followers,
        reportType,
       JSON.stringify({
         ...aggregate,
         reportType,
         mapping,
         salesMetrics:
           reportType === 'sales_data'
             ? {
                 orders: aggregate.orders,
                 quantity: aggregate.quantity,
                 refunds: aggregate.refunds,
                 profit: aggregate.profit,
                 aov: aggregate.aov,
                 margin: aggregate.margin,
               }
             : null,
         source: summaryRows.length > 0 ? 'summary_row' : 'campaign_sum',
       }),
      ]
    );

    for (const row of campaignRows) {
      const campaignName = row.name;
      const m = row.metrics;

      let campaignId = null;

      const existingCampaign = await transactionClient.query(
        `SELECT id
         FROM campaigns
         WHERE client_id = $1
         AND LOWER(name) = LOWER($2)
         AND platform = $3
         ORDER BY created_at
         LIMIT 1`,
        [clientId, campaignName, normalizedPlatform]
      );

      if (existingCampaign.rows.length) {
        campaignId = existingCampaign.rows[0].id;
      } else {
        const campResult = await transactionClient.query(
          `INSERT INTO campaigns (client_id, name, platform)
           VALUES ($1,$2,$3)
           RETURNING id`,
          [clientId, campaignName, normalizedPlatform]
        );

        campaignId = campResult.rows[0].id;
      }

      await transactionClient.query(
        `INSERT INTO performance_data
          (client_id, campaign_id, upload_id, platform, external_campaign_name, report_month, date_range_start, date_range_end,
          spend, impressions, clicks, ctr, cpc, conversions, cpa, roas, revenue, reach, followers, report_type, raw_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         ON CONFLICT (client_id, platform, external_campaign_name, report_month)
         DO UPDATE SET
           campaign_id = EXCLUDED.campaign_id,
           upload_id = EXCLUDED.upload_id,
           date_range_start = EXCLUDED.date_range_start,
           date_range_end = EXCLUDED.date_range_end,
           spend = EXCLUDED.spend,
           impressions = EXCLUDED.impressions,
           clicks = EXCLUDED.clicks,
           ctr = EXCLUDED.ctr,
           cpc = EXCLUDED.cpc,
           conversions = EXCLUDED.conversions,
           cpa = EXCLUDED.cpa,
           roas = EXCLUDED.roas,
           revenue = EXCLUDED.revenue,
           reach = EXCLUDED.reach,
           followers = EXCLUDED.followers,
           raw_data = EXCLUDED.raw_data,
           report_type = EXCLUDED.report_type,
           updated_at = NOW()`,
        [
          clientId,
          campaignId,
          uploadId,
          normalizedPlatform,
          campaignName,
          reportMonth,
          finalDateStart,
          finalDateEnd,
          m.spend,
          m.impressions,
          m.clicks,
          m.ctr,
          m.cpc,
          m.conversions,
          m.cpa,
          m.roas,
          m.revenue,
          m.reach,
          m.followers,
          reportType,
          JSON.stringify({
            ...m,
            campaignName,
            reportType,
            mapping,
            salesMetrics:
              reportType === 'sales_data'
                ? {
                    orders: m.orders,
                    quantity: m.quantity,
                    refunds: m.refunds,
                    profit: m.profit,
                    aov: m.aov,
                    margin: m.margin,
                  }
                : null,
            rawData: row.rawData,
          }),
        ]
      );
    }

    await transactionClient.query(
      `UPDATE report_uploads
       SET extraction_status = 'completed',
           date_range_start = COALESCE(date_range_start, $2),
           date_range_end = COALESCE(date_range_end, $3),
           report_type = $4
       WHERE id = $1`,
      [uploadId, finalDateStart, finalDateEnd, reportType]
    );

    await transactionClient.query('COMMIT');
  } catch (error) {
    console.error('Mapping import error:', error);

    if (transactionClient) {
      await transactionClient.query('ROLLBACK').catch(() => {});
    }

    await db.query(
      `UPDATE report_uploads
       SET extraction_status = 'failed',
           extraction_error = $1
       WHERE id = $2`,
      [error.message, uploadId]
    );

    throw error;
  } finally {
    transactionClient?.release();
  }
}

module.exports = {
  detectPlatform,
};
