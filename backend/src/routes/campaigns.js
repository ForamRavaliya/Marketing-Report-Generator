// campaigns.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/client/:clientId', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT c.*, COUNT(pd.id) as data_count 
       FROM campaigns c
       LEFT JOIN performance_data pd ON pd.campaign_id = c.id
       WHERE c.client_id=$1
       GROUP BY c.id ORDER BY c.name`,
      [req.params.clientId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

module.exports = router;
