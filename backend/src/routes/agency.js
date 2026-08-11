const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { REPORT_THEME_NAMES, DEFAULT_REPORT_THEME, REPORT_THEME_META } = require('../utils/pdf/theme');

router.use(authenticate);

const PDF_THEMES = ['professional', 'minimal', 'branded'];

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only PNG, JPG, JPEG, and WEBP logos are allowed'));
    }
    cb(null, true);
  },
});

router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, primary_color, secondary_color, contact_email,
              phone, website, address, logo_url, pdf_theme, report_theme, updated_at, created_at, is_active
       FROM agencies
       WHERE id = $1`,
      [req.user.agency_id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Agency not found' });
    }

    const agency = result.rows[0];
    res.json({
      ...agency,
      pdf_theme: PDF_THEMES.includes(agency.pdf_theme) ? agency.pdf_theme : 'professional',
      report_theme: REPORT_THEME_NAMES.includes(agency.report_theme) ? agency.report_theme : DEFAULT_REPORT_THEME,
    });
  } catch (error) {
    console.error('Fetch agency error:', error);
    res.status(500).json({ error: 'Failed to fetch agency' });
  }
});

router.put('/', requireAdmin, upload.single('logo'), async (req, res) => {
  try {
    const { name, primaryColor, secondaryColor, pdfTheme, reportTheme } = req.body;

    if (pdfTheme !== undefined && !PDF_THEMES.includes(pdfTheme)) {
      return res.status(400).json({ error: `pdfTheme must be one of: ${PDF_THEMES.join(', ')}` });
    }
    if (reportTheme !== undefined && !REPORT_THEME_NAMES.includes(reportTheme)) {
      return res.status(400).json({ error: `reportTheme must be one of: ${REPORT_THEME_NAMES.join(', ')}` });
    }

    let logoUrl = null;
    let logoPublicId = null;

    if (req.file) {
      const currentAgency = await db.query(
        `SELECT logo_public_id FROM agencies WHERE id = $1`,
        [req.user.agency_id]
      );

      //if (currentAgency.rows[0]?.logo_public_id) {
        //await cloudinary.uploader.destroy(currentAgency.rows[0].logo_public_id);
      //}

      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
         {
           folder: 'marketing-report-generator/agency-logos',
           resource_type: 'image',
         },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );

        stream.end(req.file.buffer);
      });

      logoUrl = uploadResult.secure_url;
      logoPublicId = uploadResult.public_id;
    }

    const result = await db.query(
      `UPDATE agencies SET
          name = COALESCE($1, name),
          primary_color = COALESCE($2, primary_color),
          secondary_color = COALESCE($3, secondary_color),
          logo_url = COALESCE($4, logo_url),
          logo_public_id = COALESCE($5, logo_public_id),
          pdf_theme = COALESCE($6, pdf_theme),
          report_theme = COALESCE($7, report_theme),
          updated_at = NOW()
       WHERE id = $8
       RETURNING id, name, primary_color, secondary_color, logo_url, pdf_theme, report_theme, updated_at, created_at, is_active`,
      [
        name,
        primaryColor,
        secondaryColor,
        logoUrl,
        logoPublicId,
        pdfTheme,
        reportTheme,
        req.user.agency_id,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Agency update error:', error);
    res.status(500).json({ error: 'Failed to update agency' });
  }
});

module.exports = router;