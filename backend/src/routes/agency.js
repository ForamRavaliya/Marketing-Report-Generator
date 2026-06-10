const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

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
              phone, website, address, logo_url, updated_at, created_at, is_active
       FROM agencies
       WHERE id = $1`,
      [req.user.agency_id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Agency not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Fetch agency error:', error);
    res.status(500).json({ error: 'Failed to fetch agency' });
  }
});

router.put('/', upload.single('logo'), async (req, res) => {
  try {
    const { name, primaryColor, secondaryColor } = req.body;

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
          updated_at = NOW()
       WHERE id = $6
       RETURNING id, name, primary_color, secondary_color, logo_url, updated_at, created_at, is_active`,
      [
        name,
        primaryColor,
        secondaryColor,
        logoUrl,
        logoPublicId,
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