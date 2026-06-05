const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const {
  extractFromCSV,
  extractFromExcel,
  extractFromPDF,
  extractFromImage,
  COLUMN_MAP,
  normalizeHeader,
  parseNum,
} = require('../utils/extractor');

const XLSX = require('xlsx');
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

const isAny = (header, words) => {
  const h = norm(header);
  return words.some((w) => h === norm(w) || h.includes(norm(w)));
};

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

function suggestColumnMapping(headers) {
  const mapping = {};

  const find = (words) => headers.find((h) => isAny(h, words));

  mapping.spend = find([
    'amount spent',
    'amount spent inr',
    'amount spent (inr)',
    'spend',
    'meta spends',
    'meta spend',
    'total spend',
    'ad spend',
  ]);

  mapping.revenue = find([
    'website revenue',
    'revenue',
    'sales revenue',
    'purchase value',
    'conversion value',
    'meta reported revenue',
    'total revenue',
  ]);

  mapping.conversions = find([
    'results',
    'leads',
    'orders',
    'conversions',
    'purchases',
    'purchase',
  ]);

  mapping.clicks = find([
    'clicks',
    'link clicks',
    'website clicks',
    'outbound clicks',
    'all clicks',
    'unique clicks',
    'inline link clicks',
  ]);

  mapping.impressions = find([
    'impressions',
    'total impressions',
  ]);

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
         extraction_status
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'mapping_required')
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
      ]
    );

    const headers = await extractHeaders(req.file.path, fileType);
    const suggestedMapping = suggestColumnMapping(headers);

    res.status(201).json({
      uploadId: uploadResult.rows[0].id,
      fileType,
      headers,
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
      uploadRow.client_id,
      uploadRow.platform,
      uploadRow.date_range_start,
      uploadRow.date_range_end,
      mapping
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

    const uploadResult = await db.query(
      `INSERT INTO report_uploads
       (client_id, uploaded_by, file_name, file_type, file_path, file_size, platform, date_range_start, date_range_end, extraction_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'processing')
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
      ]
    );

    const uploadId = uploadResult.rows[0].id;

    processFile(uploadId, fileType, filePath, clientId, platform, dateRangeStart, dateRangeEnd)
      .catch((err) => console.error('FILE PROCESS ERROR:', err));

    res.status(201).json({
      uploadId,
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
  clientId,
  platform,
  dateStart,
  dateEnd,
  mapping
) {
  try {
    const records = await buildRecordsFromMappedFile(filePath, fileType);

    const reportMonth = dateStart ? new Date(dateStart) : new Date();
    reportMonth.setDate(1);

    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalConversions = 0;
    let totalRevenue = 0;
    let totalReach = 0;
    let totalFollowers = 0;

    const getValue = (record, field) => {
      const col = mapping[field];
      if (!col || col === 'ignore') return 0;

      if (record[col] !== undefined && record[col] !== null && record[col] !== '') {
        return parseNum(record[col]);
      }

      const wanted = normalizeHeader(col);

      const actualKey = Object.keys(record).find(
        (key) => normalizeHeader(key) === wanted
      );

      if (!actualKey) return 0;

      return parseNum(record[actualKey]);
    };

    for (const record of records) {
      const spend = getValue(record, 'spend');
      const impressions = getValue(record, 'impressions');
      let clicks = getValue(record, 'clicks');
      const ctrValue = getValue(record, 'ctr');
      const cpcValue = getValue(record, 'cpc');
      const conversions = getValue(record, 'conversions');
      const revenue = getValue(record, 'revenue');
      const reach = getValue(record, 'reach');
      const followers = getValue(record, 'followers');

      if (!clicks && impressions > 0 && ctrValue > 0) {
        clicks = (impressions * ctrValue) / 100;
      }

      if (!clicks && spend > 0 && cpcValue > 0) {
        clicks = spend / cpcValue;
      }

      totalSpend += spend;
      totalImpressions += impressions;
      totalClicks += clicks;
      totalConversions += conversions;
      totalRevenue += revenue;
      totalReach += reach;
      totalFollowers += followers;
    }

    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
    const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    const metrics = {
      spend: totalSpend,
      impressions: totalImpressions,
      clicks: totalClicks,
      ctr,
      cpc,
      conversions: totalConversions,
      cpa,
      roas,
      revenue: totalRevenue,
      reach: totalReach,
      followers: totalFollowers,
      mapping,
    };

    await db.query(
      `INSERT INTO performance_data
        (client_id, upload_id, platform, external_campaign_name, report_month, date_range_start, date_range_end,
         spend, impressions, clicks, ctr, cpc, conversions, cpa, roas, revenue, reach, followers, raw_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (client_id, platform, external_campaign_name, report_month)
       DO UPDATE SET
         upload_id = EXCLUDED.upload_id,
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
         updated_at = NOW()`,
      [
        clientId,
        uploadId,
        platform || 'meta',
        'aggregate',
        reportMonth,
        dateStart || null,
        dateEnd || null,
        metrics.spend,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.cpc,
        metrics.conversions,
        metrics.cpa,
        metrics.roas,
        metrics.revenue,
        metrics.reach,
        metrics.followers,
        JSON.stringify(metrics),
      ]
    );

    await db.query(
      `UPDATE report_uploads
       SET extraction_status = 'completed'
       WHERE id = $1`,
      [uploadId]
    );
  } catch (error) {
    console.error('Mapping import error:', error);

    await db.query(
      `UPDATE report_uploads
       SET extraction_status = 'failed',
           extraction_error = $1
       WHERE id = $2`,
      [error.message, uploadId]
    );

    throw error;
  }
}

async function processFile(uploadId, fileType, filePath, clientId, platform, dateStart, dateEnd) {
  try {
    let result;

    if (fileType === 'csv') result = await extractFromCSV(filePath);
    else if (fileType === 'excel') result = await extractFromExcel(filePath);
    else if (fileType === 'pdf') result = await extractFromPDF(filePath);
    else if (fileType === 'image') result = await extractFromImage(filePath);
    else throw new Error('Unsupported file type');

    const { metrics, campaigns } = result;

    const reportMonth = dateStart ? new Date(dateStart) : new Date();
    reportMonth.setDate(1);

    if (
      metrics.spend ||
      metrics.impressions ||
      metrics.clicks ||
      metrics.conversions ||
      metrics.reach ||
      metrics.followers
    ) {
      await db.query(
        `INSERT INTO performance_data
          (client_id, upload_id, platform, external_campaign_name, report_month, date_range_start, date_range_end,
           spend, impressions, clicks, ctr, cpc, conversions, cpa, roas, revenue, reach, followers, raw_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (client_id, platform, external_campaign_name, report_month)
         DO UPDATE SET
           upload_id = EXCLUDED.upload_id,
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
           updated_at = NOW()`,
        [
          clientId,
          uploadId,
          platform || 'meta',
          'aggregate',
          reportMonth,
          dateStart || null,
          dateEnd || null,
          metrics.spend || 0,
          metrics.impressions || 0,
          metrics.clicks || 0,
          metrics.ctr || 0,
          metrics.cpc || 0,
          metrics.conversions || 0,
          metrics.cpa || 0,
          metrics.roas || 0,
          metrics.revenue || 0,
          metrics.reach || 0,
          metrics.followers || 0,
          JSON.stringify(metrics),
        ]
      );
    }

    for (const camp of campaigns) {
      if (
        !camp.spend &&
        !camp.impressions &&
        !camp.clicks &&
        !camp.conversions &&
        !camp.reach &&
        !camp.followers
      ) {
        continue;
      }

      let campaignId = null;
      const campaignName = camp.name || 'Unknown Campaign';

      const campResult = await db.query(
        `INSERT INTO campaigns (client_id, name, platform)
         VALUES ($1,$2,$3)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [clientId, campaignName, camp.platform || platform || 'other']
      );

      if (campResult.rows.length) {
        campaignId = campResult.rows[0].id;
      } else {
        const existing = await db.query(
          'SELECT id FROM campaigns WHERE client_id = $1 AND name = $2',
          [clientId, campaignName]
        );
        campaignId = existing.rows[0]?.id || null;
      }

      await db.query(
        `INSERT INTO performance_data
          (client_id, campaign_id, upload_id, platform, external_campaign_name, report_month, date_range_start, date_range_end,
           spend, impressions, clicks, ctr, cpc, conversions, cpa, roas, revenue, reach, followers, raw_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         ON CONFLICT (client_id, platform, external_campaign_name, report_month)
         DO UPDATE SET
           campaign_id = EXCLUDED.campaign_id,
           upload_id = EXCLUDED.upload_id,
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
           updated_at = NOW()`,
        [
          clientId,
          campaignId,
          uploadId,
          camp.platform || platform || 'other',
          campaignName,
          reportMonth,
          dateStart || null,
          dateEnd || null,
          camp.spend || 0,
          camp.impressions || 0,
          camp.clicks || 0,
          camp.ctr || 0,
          camp.cpc || 0,
          camp.conversions || 0,
          camp.cpa || 0,
          camp.roas || 0,
          camp.revenue || 0,
          camp.reach || 0,
          camp.followers || 0,
          JSON.stringify(camp.rawData || {}),
        ]
      );
    }

    await db.query(
      `UPDATE report_uploads
       SET extraction_status = 'completed'
       WHERE id = $1`,
      [uploadId]
    );
  } catch (error) {
    console.error('File processing error:', error);

    await db.query(
      `UPDATE report_uploads
       SET extraction_status = 'failed',
           extraction_error = $1
       WHERE id = $2`,
      [error.message, uploadId]
    );
  }
}

router.get('/client/:clientId', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ru.*, u.full_name AS uploaded_by_name
       FROM report_uploads ru
       LEFT JOIN users u ON ru.uploaded_by = u.id
       WHERE ru.client_id = $1
       ORDER BY ru.created_at DESC
       LIMIT 50`,
      [req.params.clientId]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch uploads' });
  }
});

router.get('/:id/status', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, extraction_status, extraction_error FROM report_uploads WHERE id = $1',
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get status' });
  }
});

router.post('/manual', async (req, res) => {
  try {
    const { clientId, platform, reportMonth, metrics, campaignName } = req.body;

    if (!clientId || !platform || !reportMonth) {
      return res.status(400).json({
        error: 'clientId, platform, and reportMonth required',
      });
    }

    const clientCheck = await db.query(
      'SELECT id FROM clients WHERE id = $1 AND agency_id = $2',
      [clientId, req.user.agency_id]
    );

    if (!clientCheck.rows.length) {
      return res.status(403).json({ error: 'Client not found' });
    }

    const month = new Date(reportMonth);
    month.setDate(1);

    let campaignId = null;
    const externalCampaignName = campaignName || 'manual_entry';

    if (campaignName) {
      const campResult = await db.query(
        `INSERT INTO campaigns (client_id, name, platform)
         VALUES ($1,$2,$3)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [clientId, campaignName, platform]
      );

      if (campResult.rows.length) {
        campaignId = campResult.rows[0].id;
      } else {
        const existing = await db.query(
          'SELECT id FROM campaigns WHERE client_id = $1 AND name = $2',
          [clientId, campaignName]
        );
        campaignId = existing.rows[0]?.id || null;
      }
    }

    const result = await db.query(
      `INSERT INTO performance_data
        (client_id, campaign_id, platform, external_campaign_name, report_month,
         spend, impressions, clicks, ctr, cpc, conversions, cpa, roas, revenue, reach, followers)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (client_id, platform, external_campaign_name, report_month)
       DO UPDATE SET
         campaign_id = EXCLUDED.campaign_id,
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
         updated_at = NOW()
       RETURNING *`,
      [
        clientId,
        campaignId,
        platform,
        externalCampaignName,
        month,
        metrics.spend || 0,
        metrics.impressions || 0,
        metrics.clicks || 0,
        metrics.ctr || 0,
        metrics.cpc || 0,
        metrics.conversions || 0,
        metrics.cpa || 0,
        metrics.roas || 0,
        metrics.revenue || 0,
        metrics.reach || 0,
        metrics.followers || 0,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Manual entry error:', error);
    res.status(500).json({ error: 'Failed to save data' });
  }
});

module.exports = router;