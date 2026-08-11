// campaigns.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Ensure the requested client belongs to the caller's agency before any
// handler below runs — prevents cross-tenant access via a guessed clientId.
router.param('clientId', async (req, res, next, clientId) => {
  try {
    const result = await db.query(
      'SELECT id FROM clients WHERE id = $1 AND agency_id = $2',
      [clientId, req.user.agency_id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Client not found' });
    }
    next();
  } catch (error) {
    console.error('Client access check error:', error);
    res.status(500).json({ error: 'Failed to verify client access' });
  }
});

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
