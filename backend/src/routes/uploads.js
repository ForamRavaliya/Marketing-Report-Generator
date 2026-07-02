const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { detectReportType } = require('../utils/reportType');
const { sanitizeImportedMetrics, buildMonthlySummary } = require('../utils/metrics');
const platformType = require('../utils/platformType');
const detectPlatform =
  typeof platformType === 'function'
    ? platformType
    : platformType.detectPlatform;

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
  'purchase value',
  'conversion value',
  'sales revenue',
  'meta reported revenue',
  'total revenue',
  'revenue',
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
    'purchases',
    'purchase',
    'results',
    'leads',
    'lead',
    'conversions',
    'conversion',
    'website leads',
    'messaging conversations started',
  ], [
    'cost per result',
    'cost per conversion',
    'cost per lead',
    'cost per purchase',
    'conversion value',
    'purchase value',
    'revenue',
    'sales value',
    'website revenue',
    'total revenue',
  ]);

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
   const detectedPlatform = detectPlatform(headers, req.file.originalname);
   const finalPlatform = platform || detectedPlatform || 'other';
   const suggestedMapping = suggestColumnMapping(headers, reportType);
   const records = await buildRecordsFromMappedFile(req.file.path, fileType);
   const importValidationPreview = buildImportValidationPreview({
     records,
     reportType,
     mapping: suggestedMapping,
     availableHeaders: headers,
     detectedPlatform: finalPlatform,
   });

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
        finalPlatform,
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
      detectedPlatform: importValidationPreview.detectedPlatform,
      detectedReportType: importValidationPreview.detectedReportType,
      detectedSummaryRowFound: importValidationPreview.detectedSummaryRowFound,
      selectedSummaryTotals: importValidationPreview.selectedSummaryTotals,
      campaignRowsTotals: importValidationPreview.campaignRowsTotals,
      differencePercent: importValidationPreview.differencePercent,
      warningMessage: importValidationPreview.warningMessage,
      validation: importValidationPreview.validation,
      importValidationPreview,
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

function buildImportValidationPreview({
  records,
  reportType,
  mapping,
  availableHeaders,
  detectedPlatform,
}) {
  const suggestedColumns = suggestColumnMapping(availableHeaders, reportType);
  const mappedFields =
    reportType === 'sales_data'
      ? ['product', 'revenue', 'orders', 'quantity', 'refunds', 'profit', 'margin', 'aov']
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

    if (record[col] !== undefined && record[col] !== null) return record[col];

    const wanted = normalizeHeader(col);
    const actualKey = Object.keys(record).find(
      (key) => normalizeHeader(key) === wanted
    );

    return actualKey ? record[actualKey] : '';
  };

  const getValue = (record, field) => parseMappedNumber(getRawValue(record, field));
  const getText = (record, field) => String(getRawValue(record, field) || '').trim();

  const isSummaryRow = (name) => {
    const n = normalizeHeader(name);

    return (
      !n ||
      n === 'all' ||
      n === 'total' ||
      n === 'totals' ||
      n === 'result' ||
      n === 'results' ||
      n === 'overall' ||
      n === 'aggregate' ||
      n === 'grand total' ||
      n === 'overall total' ||
      n === 'account total' ||
      n.includes('grand total') ||
      n.includes('overall total') ||
      n.includes('total results') ||
      n.includes('results from') ||
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

  const normalizePreviewMetric = (record) => {
    const spend = reportType === 'sales_data' ? 0 : getValue(record, 'spend');
    const impressions = reportType === 'sales_data' ? 0 : getValue(record, 'impressions');
    let clicks = reportType === 'sales_data' ? 0 : getValue(record, 'clicks');
    const ctrValue = reportType === 'sales_data' ? 0 : getValue(record, 'ctr');
    const cpcValue = reportType === 'sales_data' ? 0 : getValue(record, 'cpc');
    let conversions =
      reportType === 'sales_data'
        ? getValue(record, 'orders')
        : getValue(record, 'conversions');
    const cpaValue = reportType === 'sales_data' ? 0 : getValue(record, 'cpa');
    let revenue = getValue(record, 'revenue');
    const roasValue = reportType === 'sales_data' ? 0 : getValue(record, 'roas');
    const reach = reportType === 'sales_data' ? 0 : getValue(record, 'reach');

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

    return sanitizeImportedMetrics({
      spend,
      clicks: Math.round(clicks || 0),
      impressions: Math.round(impressions || 0),
      leads: Math.round(conversions || 0),
      purchases: Math.round(conversions || 0),
      conversions: Math.round(conversions || 0),
      revenue,
      reach: Math.round(reach || 0),
    });
  };

  const addTotals = (target, source) => {
    target.spend += source.spend || 0;
    target.clicks += source.clicks || 0;
    target.impressions += source.impressions || 0;
    target.leads += source.leads || 0;
    target.purchases += source.purchases || 0;
    target.conversions += source.conversions || 0;
    target.revenue += source.revenue || 0;
    target.reach += source.reach || 0;
  };

  const finalizeTotals = (totals) => sanitizeImportedMetrics(totals);

  const emptyTotals = () => ({
    spend: 0,
    clicks: 0,
    impressions: 0,
    leads: 0,
    purchases: 0,
    conversions: 0,
    revenue: 0,
    reach: 0,
  });

  const summaryRows = [];
  const campaignRows = [];

  records.forEach((record, rowIndex) => {
    const rowName =
      reportType === 'sales_data'
        ? getText(record, 'product') || 'Sales Item'
        : getText(record, 'campaignName') || getText(record, 'campaign');
    const metrics = normalizePreviewMetric(record);
    const hasAnyData =
      metrics.spend ||
      metrics.clicks ||
      metrics.impressions ||
      metrics.conversions ||
      metrics.revenue ||
      metrics.reach;

    if (!hasAnyData) return;

    if (isSummaryRow(rowName)) {
      summaryRows.push({ rowIndex, metrics });
      return;
    }

    if (!isInvalidCampaignName(rowName)) {
      campaignRows.push({ rowIndex, metrics });
    }
  });

  const selectedSummaryRow = summaryRows.sort(
    (a, b) => Number(a.rowIndex || 0) - Number(b.rowIndex || 0)
  )[0];

  const selectedSummaryTotals = emptyTotals();
  if (selectedSummaryRow) addTotals(selectedSummaryTotals, selectedSummaryRow.metrics);

  const campaignRowsTotals = emptyTotals();
  campaignRows.forEach((row) => addTotals(campaignRowsTotals, row.metrics));

  const summaryTotals = selectedSummaryRow
    ? selectedSummaryTotals
    : campaignRowsTotals;

  const base = Math.max(
    Math.abs(summaryTotals.spend || 0),
    Math.abs(summaryTotals.revenue || 0),
    Math.abs(summaryTotals.conversions || 0),
    1
  );
  const differenceAmount = Math.max(
    Math.abs((campaignRowsTotals.spend || 0) - (summaryTotals.spend || 0)),
    Math.abs((campaignRowsTotals.revenue || 0) - (summaryTotals.revenue || 0)),
    Math.abs((campaignRowsTotals.conversions || 0) - (summaryTotals.conversions || 0))
  );
  const differencePercent = (differenceAmount / base) * 100;
  const warnings = [];
  const errors = [];
  const usableMetricColumns = mappedFields.filter(
    (field) => field !== 'campaignName' && field !== 'product' && Boolean(resolvedColumns[field])
  );

  if (usableMetricColumns.length === 0) {
    errors.push('No usable metric columns found');
  }

  if (
    !summaryTotals.spend &&
    !summaryTotals.clicks &&
    !summaryTotals.impressions &&
    !summaryTotals.conversions &&
    !summaryTotals.revenue &&
    !summaryTotals.reach
  ) {
    errors.push('All metric values are zero');
  }

  if (!summaryTotals.revenue) {
    warnings.push('Revenue missing, ROAS unavailable');
  }

  if ((detectedPlatform || 'other') === 'other') {
    warnings.push('Unknown platform detected');
  }

  if (!selectedSummaryRow) {
    warnings.push('No aggregate summary row detected. Totals will be calculated from campaign rows.');
  }

  if (selectedSummaryRow && differencePercent > 5) {
    warnings.push('Campaign rows total differs from aggregate row by more than 5%');
  }

  const validation = {
    isValid: errors.length === 0,
    warnings,
    errors,
    detectedPlatform,
    detectedMonths: [],
    aggregateRowsFound: summaryRows.length,
    campaignRowsFound: campaignRows.length,
    importedTotals: finalizeTotals(summaryTotals),
  };

  return {
    detectedPlatform,
    detectedReportType: reportType,
    detectedSummaryRowFound: Boolean(selectedSummaryRow),
    selectedSummaryTotals: finalizeTotals(summaryTotals),
    campaignRowsTotals: finalizeTotals(campaignRowsTotals),
    differencePercent,
    warningMessage:
      selectedSummaryRow && differencePercent > 5
        ? 'This file contains summary and breakdown rows. We will use the detected summary row for dashboard totals and campaign rows only for campaign tables.'
        : '',
    validation,
  };
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
         date_range_end,
         report_type
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
    const headers = ['csv', 'excel'].includes(uploadRow.file_type)
      ? await extractHeaders(uploadRow.file_path, uploadRow.file_type)
      : [];
    const importValidationPreview = ['csv', 'excel'].includes(uploadRow.file_type)
      ? buildImportValidationPreview({
          records: await buildRecordsFromMappedFile(uploadRow.file_path, uploadRow.file_type),
          reportType: uploadRow.report_type,
          mapping,
          availableHeaders: headers,
          detectedPlatform: uploadRow.platform || 'other',
        })
      : null;

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

 const importValidation = await processFileWithMapping(
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
      warnings: importValidation?.warnings || [],
      validation: importValidation || null,
      importValidationPreview,
    });
  } catch (error) {
    console.error('Confirm mapping error:', error);
    res.status(error.statusCode || 500).json({
      error: error.statusCode === 400 ? error.message : 'Failed to confirm mapping',
      validation: error.validation,
    });
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
const detectedPlatform = detectPlatform(headers, req.file.originalname);
const finalPlatform = platform || detectedPlatform || 'other';
const suggestedMapping = ['csv', 'excel'].includes(fileType)
  ? suggestColumnMapping(headers, reportType)
  : {};
const recordsForValidation = ['csv', 'excel'].includes(fileType)
  ? await buildRecordsFromMappedFile(filePath, fileType)
  : [];
const importValidationPreview = ['csv', 'excel'].includes(fileType)
  ? buildImportValidationPreview({
      records: recordsForValidation,
      reportType,
      mapping: suggestedMapping,
      availableHeaders: headers,
      detectedPlatform: finalPlatform,
    })
  : null;

    const uploadResult = await db.query(
      `INSERT INTO report_uploads
      (client_id, uploaded_by, file_name, file_type, file_path, file_size, platform, date_range_start, date_range_end, report_type, extraction_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        clientId,
        req.user.id,
        req.file.originalname,
        fileType,
        filePath,

        req.file.size,
        finalPlatform,
        dateRangeStart || null,
        dateRangeEnd || null,
         reportType,
        ['csv', 'excel'].includes(fileType) ? 'mapping_required' : 'processing',
      ]
    );

    const uploadId = uploadResult.rows[0].id;

if (['csv', 'excel'].includes(fileType)) {
  return res.status(201).json({
    uploadId,
    fileType,
    headers,
    reportType,
    suggestedMapping,
    requiresConfirmation: true,
    detectedPlatform: importValidationPreview.detectedPlatform,
    detectedReportType: importValidationPreview.detectedReportType,
    detectedSummaryRowFound: importValidationPreview.detectedSummaryRowFound,
    selectedSummaryTotals: importValidationPreview.selectedSummaryTotals,
    campaignRowsTotals: importValidationPreview.campaignRowsTotals,
    differencePercent: importValidationPreview.differencePercent,
    warningMessage: importValidationPreview.warningMessage,
    validation: importValidationPreview.validation,
    importValidationPreview,
  });
}

processFileWithMapping(
  uploadId,
  fileType,
  filePath,
  req.file.originalname,
  clientId,
  finalPlatform,
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

    const availableHeaders = Object.keys(records[0] || {});
    const detectedPlatform = detectPlatform(availableHeaders, originalFileName);
    const normalizedPlatform = platform || detectedPlatform || 'other';
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

    const hasInvalidNumericValue = (value) => {
      if (value === null || value === undefined || value === '') return false;
      if (typeof value === 'number') return !Number.isFinite(value);

      const text = String(value).trim();
      if (!text) return false;

      const numericText = text.replace(/,/g, '').replace(/[^\d.+-]/g, '');
      if (!numericText || numericText === '-' || numericText === '+' || numericText === '.') {
        return /[0-9]/.test(text);
      }

      return !Number.isFinite(Number.parseFloat(numericText));
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
    const toMonthStart = (date) => {
      if (!date || Number.isNaN(date.getTime())) return null;
      const month = new Date(date);
      month.setDate(1);
      month.setHours(0, 0, 0, 0);
      return month;
    };

    const parseDateCandidate = (value, dateRangeStart, dateRangeEnd) => {
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
      }

      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        // Excel serial dates are days since 1899-12-30.
        const excelDate = new Date(Date.UTC(1899, 11, 30 + Math.floor(value)));
        if (!Number.isNaN(excelDate.getTime())) return excelDate;
      }

      const raw = String(value || '').trim();
      if (!raw) return null;

      if (/^\d+(\.\d+)?$/.test(raw)) {
        const serial = Number(raw);
        if (serial > 25569 && serial < 60000) {
          const excelDate = new Date(Date.UTC(1899, 11, 30 + Math.floor(serial)));
          if (!Number.isNaN(excelDate.getTime())) return excelDate;
        }
      }

      const monthNames = {
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

      const inSelectedRange = (date) => {
        if (!date || Number.isNaN(date.getTime())) return false;
        if (!dateRangeStart || !dateRangeEnd) return true;
        const start = new Date(dateRangeStart);
        const end = new Date(dateRangeEnd);
        return date >= start && date <= end;
      };

      const numericMatch = raw.match(/^(\d{1,4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,4})$/);
      if (numericMatch) {
        const a = Number(numericMatch[1]);
        const b = Number(numericMatch[2]);
        const c = Number(numericMatch[3]);
        const year = a > 999 ? a : c > 999 ? c : c + 2000;
        const validDate = (y, m, d) => {
          if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
          const date = new Date(y, m - 1, d);
          return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
            ? date
            : null;
        };
        const candidates = (
          a > 999
            ? [validDate(year, b, c)]
            : [
                validDate(year, b, a), // dd/mm/yyyy
                validDate(year, a, b), // mm/dd/yyyy
              ]
        ).filter(Boolean);

        return candidates.find(inSelectedRange) || candidates.find((d) => !Number.isNaN(d.getTime())) || null;
      }

      const monthNameMatch = raw.match(
        /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$|^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$|^([A-Za-z]+)\s+(\d{4})$/
      );

      if (monthNameMatch) {
        const monthText = (monthNameMatch[1] || monthNameMatch[5] || monthNameMatch[7] || '').toLowerCase();
        const day = Number(monthNameMatch[2] || monthNameMatch[4] || 1);
        const year = Number(monthNameMatch[3] || monthNameMatch[6] || monthNameMatch[8]);
        if (Object.prototype.hasOwnProperty.call(monthNames, monthText) && year) {
          return new Date(year, monthNames[monthText], day || 1);
        }
      }

      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const getRowDate = (record) => {
      const possibleDateColumns = new Set([
        'date',
        'day',
        'month',
        'report date',
        'reporting starts',
        'reporting start',
        'reporting ends',
        'reporting end',
        'start date',
        'end date',
        'campaign start',
        'campaign end',
        'purchase date',
        'transaction date',
        'created date',
      ]);

      for (const key of Object.keys(record || {})) {
        const normalized = normalizeHeader(key);
        if (!possibleDateColumns.has(normalized)) continue;

        const parsed = parseDateCandidate(record[key], finalDateStart, finalDateEnd);
        if (parsed) return parsed;
      }

      return null;
    };

    const selectedRangeSpansMultipleMonths = (() => {
      if (!finalDateStart || !finalDateEnd) return false;
      const start = toMonthStart(new Date(finalDateStart));
      const end = toMonthStart(new Date(finalDateEnd));
      return Boolean(start && end && start.getTime() !== end.getTime());
    })();

    const importWarnings = new Set();

    const getRowReportMonth = (record, fallbackDateRangeStart = finalDateStart) => {
      const rowDate = getRowDate(record || {});
      const detectedMonth = toMonthStart(rowDate);
      if (detectedMonth) return detectedMonth;

      const fallbackMonth = toMonthStart(fallbackDateRangeStart ? new Date(fallbackDateRangeStart) : reportMonth) || reportMonth;

      if (selectedRangeSpansMultipleMonths) {
        importWarnings.add(
          'File has multi-month date range but no row-level month column. Imported as one period summary.'
        );
      }

      return fallbackMonth;
    };

    const isSummaryRow = (name) => {
      const n = normalizeHeader(name);

      return (
        !n ||
        n === 'all' ||
        n === 'total' ||
        n === 'totals' ||
        n === 'result' ||
        n === 'results' ||
        n === 'overall' ||
        n === 'aggregate' ||
        n === 'grand total' ||
        n === 'overall total' ||
        n === 'account total' ||
        n.includes('grand total') ||
        n.includes('overall total') ||
        n.includes('total results') ||
        n.includes('results from') ||
        n.includes('account total')
      );
    };

    const isInvalidCampaignName = (name) => {
      const n = normalizeHeader(name);
      return (
        !n ||
        n === 'all' ||
        n === 'total' ||
        n === 'aggregate' ||
        n === 'overall' ||
        n === 'account total' ||
        n === 'male' ||
        n === 'female' ||
        n === 'unknown' ||
        n === 'desktop' ||
        n === 'mobile' ||
        n === 'tablet' ||
        n === 'facebook' ||
        n === 'instagram' ||
        n === 'audience network' ||
        n === 'messenger' ||
        /^\d{1,2}\s*-\s*\d{1,2}$/.test(n) ||
        /^\d{1,2}\s*\+$/.test(n) ||
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

  return sanitizeImportedMetrics({
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
  });
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

    return sanitizeImportedMetrics({
      spend,
      impressions: Math.round(impressions || 0),
      clicks: Math.round(clicks || 0),
      conversions: Math.round(conversions || 0),
      revenue,
      reach: Math.round(reach || 0),
      followers: Math.round(followers || 0),
    });
    };

    const rawCampaignRows = [];
    const summaryRows = [];
    const detailRowsForAggregate = [];
    const validationWarnings = new Set();
    const validationErrors = new Set();
    let invalidNumericRows = 0;
    let negativeMetricRows = 0;
    let impossibleImpressionRows = 0;

    for (const [rowIndex, record] of records.entries()) {
    const campaignName =
      reportType === 'sales_data'
        ? getText(record, 'product') || 'Sales Item'
        : getText(record, 'campaignName') || getText(record, 'campaign');

     const metricFields =
       reportType === 'sales_data'
         ? ['revenue', 'orders', 'quantity', 'refunds', 'profit']
         : ['spend', 'impressions', 'clicks', 'conversions', 'revenue', 'reach', 'followers'];

     if (
       metricFields.some((field) => {
         const rawValue = getRawValue(record, field);
         return rawValue !== '' && hasInvalidNumericValue(rawValue);
       })
     ) {
       invalidNumericRows += 1;
       continue;
     }

     const rawSpend = reportType === 'sales_data' ? 0 : getValue(record, 'spend');
     const rawImpressions = reportType === 'sales_data' ? 0 : getValue(record, 'impressions');
     const rawClicks = reportType === 'sales_data' ? 0 : getValue(record, 'clicks');
     const rawConversions =
       reportType === 'sales_data' ? getValue(record, 'orders') : getValue(record, 'conversions');
     const rawRevenue = getValue(record, 'revenue');

     if (
       rawSpend < 0 ||
       rawClicks < 0 ||
       rawConversions < 0 ||
       rawRevenue < 0 ||
       rawImpressions < 0
     ) {
       negativeMetricRows += 1;
       continue;
     }

     if (rawImpressions > 0 && rawClicks > 0 && rawImpressions < rawClicks) {
       impossibleImpressionRows += 1;
     }

     const metrics =
       reportType === 'sales_data'
         ? normalizeSalesMetric(record)
         : normalizeCampaignMetric(record);

      if (rawImpressions > 0 && rawClicks > 0 && rawImpressions < rawClicks) {
        metrics.ctr = 0;
      }

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

      const rowHasDetectedDate = Boolean(getRowDate(record));
      const rowReportMonth = getRowReportMonth(record);

      if (isSummaryRow(campaignName)) {
        summaryRows.push({
          name: 'aggregate',
          metrics,
          rawData: record,
          reportMonth: rowReportMonth,
          hasRowDate: rowHasDetectedDate,
          rowIndex,
        });
      } else {
        if (isInvalidCampaignName(campaignName)) continue;

        detailRowsForAggregate.push({
          name: campaignName,
          metrics,
          rawData: record,
          reportMonth: rowReportMonth,
          hasRowDate: rowHasDetectedDate,
          rowIndex,
        });

        rawCampaignRows.push({
          name: campaignName,
          metrics,
          rawData: record,
          reportMonth: rowReportMonth,
          hasRowDate: rowHasDetectedDate,
          rowIndex,
        });
      }
    }

    const requiredMetricFields =
      reportType === 'sales_data'
        ? ['revenue', 'orders']
        : ['spend', 'impressions', 'clicks', 'conversions', 'revenue'];
    const metricColumnsFound = requiredMetricFields.filter((field) => Boolean(resolvedColumns[field]));

    if (metricColumnsFound.length === 0) {
      validationErrors.add('No usable metric columns found');
    }

    if (invalidNumericRows > 0) {
      validationErrors.add('Invalid numeric data');
    }

    if (negativeMetricRows > 0) {
      validationErrors.add('Metric values cannot be negative');
    }

    if (impossibleImpressionRows > 0) {
      validationWarnings.add('Some rows had invalid impressions/clicks and were normalized.');
    }

    if (!summaryRows.length && !detailRowsForAggregate.length) {
      validationErrors.add('All metric values are zero');
    }

    const campaignsByName = new Map();

    for (const row of rawCampaignRows) {
      const monthKey = row.reportMonth.toISOString().slice(0, 10);
      const key = `${row.name.trim().toLowerCase()}::${monthKey}`;
      const existing = campaignsByName.get(key) || {
        name: row.name.trim(),
        reportMonth: row.reportMonth,
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

    const campaignRows = Array.from(campaignsByName.values()).map((row) => ({
      ...row,
      metrics: sanitizeImportedMetrics(row.metrics),
    }));

const selectSummaryRowsByMonth = (rows) => {
  const byMonth = new Map();

  for (const row of rows) {
    const rowMonth = row.reportMonth || getRowReportMonth(row.rawData || {});
    const monthKey = rowMonth.toISOString().slice(0, 10);

    const current = byMonth.get(monthKey);

    // IMPORTANT:
    // Meta exports can contain many "All" summary/breakdown rows.
    // The correct account-level total is usually the FIRST summary row.
    // Do NOT pick the largest row; that causes inflated totals.
    if (!current || Number(row.rowIndex || 0) < Number(current.rowIndex || 0)) {
      byMonth.set(monthKey, row);
    }
  }

  return Array.from(byMonth.values());
};

const detectedMonthKey = (row) => row.reportMonth.toISOString().slice(0, 10);
const summaryDetectedMonths = new Set(summaryRows.filter((row) => row.hasRowDate).map(detectedMonthKey));
const detailDetectedMonths = new Set(detailRowsForAggregate.filter((row) => row.hasRowDate).map(detectedMonthKey));
const useCampaignRowsForMonthlyAggregate =
  detailDetectedMonths.size > 1 &&
  summaryRows.length > 0 &&
  summaryDetectedMonths.size <= 1;

if (useCampaignRowsForMonthlyAggregate) {
  importWarnings.add(
    'Detected one period-level summary row plus dated monthly detail rows. Monthly dashboard/PDF totals use dated detail rows to avoid forcing all data into one month.'
  );
}

const rowsForAggregate =
  summaryRows.length > 0 && !useCampaignRowsForMonthlyAggregate
    ? selectSummaryRowsByMonth(summaryRows)
    : detailRowsForAggregate;

const monthlyAggregates = new Map();

for (const row of rowsForAggregate) {
  const rowMonth = row.reportMonth || getRowReportMonth(row.rawData || {});
  const monthKey = rowMonth.toISOString().slice(0, 10);

  const existing = monthlyAggregates.get(monthKey) || {
    reportMonth: rowMonth,
    rows: [],
  };

  existing.rows.push(row);

  monthlyAggregates.set(monthKey, existing);
}

const aggregateRowsPerMonth = new Map();
for (const [monthKey, value] of monthlyAggregates.entries()) {
  aggregateRowsPerMonth.set(monthKey, value.rows.length);
}

const campaignRowsPerMonth = new Map();
for (const row of campaignRows) {
  const monthKey = (row.reportMonth || getRowReportMonth(row.rawData?.[0] || {})).toISOString().slice(0, 10);
  campaignRowsPerMonth.set(monthKey, (campaignRowsPerMonth.get(monthKey) || 0) + 1);
}

const aggregateRowsFound = Array.from(aggregateRowsPerMonth.values()).reduce((a, b) => a + b, 0);
const campaignRowsFound = Array.from(campaignRowsPerMonth.values()).reduce((a, b) => a + b, 0);
const aggregateRowsPerMonthCounts = Object.fromEntries(aggregateRowsPerMonth);
const campaignRowsPerMonthCounts = Object.fromEntries(campaignRowsPerMonth);

const detectedMonths = Array.from(monthlyAggregates.keys()).sort();
const hasAnyRowDate = [...summaryRows, ...detailRowsForAggregate].some((row) => row.hasRowDate);

if (selectedRangeSpansMultipleMonths && !hasAnyRowDate) {
  validationErrors.add('No date/month detected in multi-month file');
}

if ((normalizedPlatform || 'other') === 'other') {
  validationWarnings.add('Unknown platform detected');
}

if (!summaryRows.length) {
  validationWarnings.add('No aggregate summary row detected. Totals were calculated from campaign rows.');
}

const importedTotals = buildMonthlySummary(
  Array.from(monthlyAggregates.values()).flatMap((month) => month.rows)
);

if (importedTotals.revenue <= 0) {
  validationWarnings.add('Revenue missing, ROAS unavailable');
}

if (
  importedTotals.impressions > 0 &&
  importedTotals.clicks > importedTotals.impressions
) {
  validationErrors.add('Impressions cannot be smaller than clicks');
}

if (summaryRows.length && campaignRows.length) {
  const summaryTotals = buildMonthlySummary(rowsForAggregate);
  const campaignTotals = buildMonthlySummary(campaignRows);
  const base = Math.max(
    Math.abs(summaryTotals.spend || 0),
    Math.abs(summaryTotals.revenue || 0),
    Math.abs(summaryTotals.conversions || 0),
    1
  );
  const differenceAmount = Math.max(
    Math.abs((campaignTotals.spend || 0) - (summaryTotals.spend || 0)),
    Math.abs((campaignTotals.revenue || 0) - (summaryTotals.revenue || 0)),
    Math.abs((campaignTotals.conversions || 0) - (summaryTotals.conversions || 0))
  );

  if ((differenceAmount / base) * 100 > 5) {
    validationWarnings.add('Campaign rows total differs from aggregate row by more than 5%');
  }
}

const uploadValidation = {
  isValid: validationErrors.size === 0,
  warnings: Array.from(new Set([...importWarnings, ...validationWarnings])),
  errors: Array.from(validationErrors),
  detectedPlatform: normalizedPlatform,
  detectedMonths,
  aggregateRowsFound,
  campaignRowsFound,
  importedTotals,
};

console.log('UPLOAD VALIDATION SUMMARY', {
  clientId,
  detectedPlatform: uploadValidation.detectedPlatform,
  detectedMonths: uploadValidation.detectedMonths,
  aggregateRowsFound: uploadValidation.aggregateRowsFound,
  campaignRowsFound: uploadValidation.campaignRowsFound,
  aggregateRowsPerMonth: aggregateRowsPerMonthCounts,
  campaignRowsPerMonth: campaignRowsPerMonthCounts,
  warnings: uploadValidation.warnings,
  errors: uploadValidation.errors,
});

if (!uploadValidation.isValid) {
  const validationError = new Error(uploadValidation.errors.join('; '));
  validationError.statusCode = 400;
  validationError.validation = uploadValidation;
  throw validationError;
}
    transactionClient = await db.getClient();
    await transactionClient.query('BEGIN');
    await transactionClient.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`${clientId}:${normalizedPlatform}`]
    );

    await transactionClient.query(
      `DELETE FROM performance_data
       WHERE client_id = $1
       AND platform = $2
       AND COALESCE(date_range_start, report_month) <= $4
       AND COALESCE(date_range_end, report_month) >= $3`,
      [
        clientId,
        normalizedPlatform,
        finalDateStart || reportMonth,
        finalDateEnd || reportMonth,
      ]
    );

   for (const monthlyAggregate of monthlyAggregates.values()) {
     // Meta exports can contain one total row plus campaign rows. Counting both
     // doubles summary KPIs, so aggregate rows are built from only the detected
     // total row(s), falling back to campaign rows only when no total row exists.
     const aggregate = buildMonthlySummary(monthlyAggregate.rows);
     const aggregateReportMonth = monthlyAggregate.reportMonth;

     const monthStart = new Date(aggregateReportMonth);
     monthStart.setDate(1);
     monthStart.setHours(0, 0, 0, 0);

     const monthEnd = new Date(monthStart);
     monthEnd.setMonth(monthEnd.getMonth() + 1);
     monthEnd.setDate(0);
     monthEnd.setHours(23, 59, 59, 999);

     aggregate.aov =
       aggregate.orders > 0 ? aggregate.revenue / aggregate.orders : 0;

     aggregate.margin =
       aggregate.revenue > 0 ? (aggregate.profit / aggregate.revenue) * 100 : 0;

     console.log('[Upload Monthly Summary Selected]', {
       clientId,
       platform: normalizedPlatform,
       reportMonth: aggregateReportMonth.toISOString().slice(0, 10),
       source:
         summaryRows.length > 0 && !useCampaignRowsForMonthlyAggregate
           ? 'summary_row'
           : 'campaign_sum',
       totals: {
         spend: aggregate.spend,
         impressions: aggregate.impressions,
         clicks: aggregate.clicks,
         conversions: aggregate.conversions,
         revenue: aggregate.revenue,
         roas: aggregate.roas,
       },
     });

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
         aggregateReportMonth,
         monthStart,
         monthEnd,
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
           source:
             summaryRows.length > 0 && !useCampaignRowsForMonthlyAggregate
               ? 'summary_row'
               : 'campaign_sum',
         }),
       ]
     );
   }

    for (const row of campaignRows) {
      const campaignName = row.name;
      const m = row.metrics;

     const rowReportMonth = row.reportMonth || getRowReportMonth(row.rawData[0] || {});

     const campaignMonthStart = new Date(rowReportMonth);
     campaignMonthStart.setDate(1);
     campaignMonthStart.setHours(0, 0, 0, 0);

     const campaignMonthEnd = new Date(campaignMonthStart);
     campaignMonthEnd.setMonth(campaignMonthEnd.getMonth() + 1);
     campaignMonthEnd.setDate(0);
     campaignMonthEnd.setHours(23, 59, 59, 999);

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
          rowReportMonth,
          campaignMonthStart,
          campaignMonthEnd,
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
    return uploadValidation;
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

module.exports = router;
