const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { extractFromCSV, extractFromExcel, extractFromPDF, extractFromImage } = require('../utils/extractor');

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
  if (['.csv'].includes(ext)) return 'csv';
  if (['.xlsx', '.xls'].includes(ext)) return 'excel';
  if (['.png', '.jpg', '.jpeg'].includes(ext)) return 'image';
  return 'other';
};

// Upload and extract file
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { clientId, platform, dateRangeStart, dateRangeEnd } = req.body;
  if (!clientId) return res.status(400).json({ error: 'Client ID required' });

  const fileType = getFileType(req.file.originalname);
  const filePath = req.file.path;

  try {
    // Verify client belongs to agency
    const clientCheck = await db.query(
      'SELECT id FROM clients WHERE id=$1 AND agency_id=$2', [clientId, req.user.agency_id]
    );
    if (!clientCheck.rows.length) return res.status(403).json({ error: 'Client not found' });

    // Record the upload
    const uploadResult = await db.query(
      `INSERT INTO report_uploads (client_id, uploaded_by, file_name, file_type, file_path, file_size, platform, date_range_start, date_range_end, extraction_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'processing') RETURNING *`,
      [clientId, req.user.id, req.file.originalname, fileType, filePath,
       req.file.size, platform, dateRangeStart || null, dateRangeEnd || null]
    );

    const uploadId = uploadResult.rows[0].id;

    // Run extraction asynchronously
    processFile(uploadId, fileType, filePath, clientId, platform, dateRangeStart, dateRangeEnd)
      .catch(err => console.error('Extraction error:', err));

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

    // Store aggregated metrics
    if (metrics.spend || metrics.impressions || metrics.clicks) {
      await db.query(
        `INSERT INTO performance_data 
          (client_id, upload_id, platform, report_month, date_range_start, date_range_end,
           spend, impressions, clicks, ctr, cpc, conversions, cpa, roas, revenue, raw_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (client_id, platform, report_month, campaign_id) 
         DO UPDATE SET spend=EXCLUDED.spend, impressions=EXCLUDED.impressions, 
           clicks=EXCLUDED.clicks, updated_at=NOW()`,
        [clientId, uploadId, platform || 'other', reportMonth, dateStart || null, dateEnd || null,
         metrics.spend || 0, metrics.impressions || 0, metrics.clicks || 0,
         metrics.ctr || 0, metrics.cpc || 0, metrics.conversions || 0,
         metrics.cpa || 0, metrics.roas || 0, metrics.revenue || 0, JSON.stringify(metrics)]
      );
    }

    // Store individual campaigns
    for (const camp of campaigns) {
      if (!camp.spend && !camp.impressions) continue;

      // Upsert campaign
      let campaignId = null;
      if (camp.name) {
        const campResult = await db.query(
          `INSERT INTO campaigns (client_id, name, platform) VALUES ($1,$2,$3)
           ON CONFLICT DO NOTHING RETURNING id`,
          [clientId, camp.name, camp.platform || platform || 'other']
        );
        if (campResult.rows.length) {
          campaignId = campResult.rows[0].id;
        } else {
          const existing = await db.query(
            'SELECT id FROM campaigns WHERE client_id=$1 AND name=$2', [clientId, camp.name]
          );
          campaignId = existing.rows[0]?.id;
        }
      }

      await db.query(
        `INSERT INTO performance_data 
          (client_id, campaign_id, upload_id, platform, report_month, date_range_start, date_range_end,
           spend, impressions, clicks, ctr, cpc, conversions, cpa, roas, revenue, reach, raw_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (client_id, platform, report_month, campaign_id) 
         DO UPDATE SET spend=EXCLUDED.spend, impressions=EXCLUDED.impressions, updated_at=NOW()`,
        [clientId, campaignId, uploadId, camp.platform || platform || 'other', reportMonth,
         dateStart || null, dateEnd || null,
         camp.spend, camp.impressions, camp.clicks, camp.ctr, camp.cpc,
         camp.conversions, camp.cpa, camp.roas, camp.revenue, camp.reach,
         JSON.stringify(camp.rawData)]
      ).catch(() => {}); // Skip duplicates
    }

    await db.query(
      "UPDATE report_uploads SET extraction_status='completed' WHERE id=$1", [uploadId]
    );
  } catch (error) {
    await db.query(
      "UPDATE report_uploads SET extraction_status='failed', extraction_error=$1 WHERE id=$2",
      [error.message, uploadId]
    );
  }
}

// Get uploads for a client
router.get('/client/:clientId', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ru.*, u.full_name as uploaded_by_name 
       FROM report_uploads ru
       LEFT JOIN users u ON ru.uploaded_by = u.id
       WHERE ru.client_id=$1
       ORDER BY ru.created_at DESC LIMIT 50`,
      [req.params.clientId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch uploads' });
  }
});

// Get upload status
router.get('/:id/status', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, extraction_status, extraction_error FROM report_uploads WHERE id=$1',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Upload not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// Manual data entry
router.post('/manual', async (req, res) => {
  try {
    const { clientId, platform, reportMonth, metrics, campaignName } = req.body;
    if (!clientId || !platform || !reportMonth) {
      return res.status(400).json({ error: 'clientId, platform, and reportMonth required' });
    }

    const clientCheck = await db.query(
      'SELECT id FROM clients WHERE id=$1 AND agency_id=$2', [clientId, req.user.agency_id]
    );
    if (!clientCheck.rows.length) return res.status(403).json({ error: 'Client not found' });

    const month = new Date(reportMonth);
    month.setDate(1);

    let campaignId = null;
    if (campaignName) {
      const campResult = await db.query(
        `INSERT INTO campaigns (client_id, name, platform) VALUES ($1,$2,$3)
         ON CONFLICT DO NOTHING RETURNING id`,
        [clientId, campaignName, platform]
      );
      if (campResult.rows.length) {
        campaignId = campResult.rows[0].id;
      } else {
        const existing = await db.query(
          'SELECT id FROM campaigns WHERE client_id=$1 AND name=$2', [clientId, campaignName]
        );
        campaignId = existing.rows[0]?.id;
      }
    }

    const result = await db.query(
      `INSERT INTO performance_data 
        (client_id, campaign_id, platform, report_month, spend, impressions, clicks, 
         ctr, cpc, conversions, cpa, roas, revenue, reach)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (client_id, platform, report_month, campaign_id)
       DO UPDATE SET spend=EXCLUDED.spend, impressions=EXCLUDED.impressions, 
         clicks=EXCLUDED.clicks, ctr=EXCLUDED.ctr, cpc=EXCLUDED.cpc,
         conversions=EXCLUDED.conversions, cpa=EXCLUDED.cpa, roas=EXCLUDED.roas,
         revenue=EXCLUDED.revenue, updated_at=NOW()
       RETURNING *`,
      [clientId, campaignId, platform, month,
       metrics.spend || 0, metrics.impressions || 0, metrics.clicks || 0,
       metrics.ctr || 0, metrics.cpc || 0, metrics.conversions || 0,
       metrics.cpa || 0, metrics.roas || 0, metrics.revenue || 0, metrics.reach || 0]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Manual entry error:', error);
    res.status(500).json({ error: 'Failed to save data' });
  }
});

module.exports = router;
