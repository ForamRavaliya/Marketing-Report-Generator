const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../data/logos');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `agency-${req.user.agency_id}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM agencies WHERE id=$1', [req.user.agency_id]);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch agency' });
  }
});

router.put('/', upload.single('logo'), async (req, res) => {
  try {
    const { name, primaryColor, secondaryColor } = req.body;

    let result;
    if (req.file) {
      const logoUrl = `/data/logos/${req.file.filename}`;
      result = await db.query(
        `UPDATE agencies SET
          name=COALESCE($1, name),
          primary_color=COALESCE($2, primary_color),
          secondary_color=COALESCE($3, secondary_color),
          logo_url=$5,
          updated_at=NOW()
         WHERE id=$4 RETURNING *`,
        [name, primaryColor, secondaryColor, req.user.agency_id, logoUrl]
      );
    } else {
      result = await db.query(
        `UPDATE agencies SET
          name=COALESCE($1, name),
          primary_color=COALESCE($2, primary_color),
          secondary_color=COALESCE($3, secondary_color),
          updated_at=NOW()
         WHERE id=$4 RETURNING *`,
        [name, primaryColor, secondaryColor, req.user.agency_id]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Agency update error:', error);
    res.status(500).json({ error: 'Failed to update agency: ' + error.message });
  }
});

module.exports = router;
