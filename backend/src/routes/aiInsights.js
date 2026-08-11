const express = require('express');
const router = express.Router();

const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { safeNumber } = require('../utils/metrics');
const { generateAiInsights } = require('../services/aiInsightsService');

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

const safeNum = (value) => safeNumber(value, 0);

router.post('/generate/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;

    const insight = await generateAiInsights(db, { clientId });
    const metrics = insight.summary;

    if (!metrics || safeNum(metrics.spend) === 0) {
      return res.status(404).json({
        error: 'No performance data found',
      });
    }

    const saved = await db.query(
      `INSERT INTO ai_insights
       (
         client_id,
         agency_id,
         insight_type,
         summary,
         recommendations
       )
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [
        clientId,
        req.user.agency_id,
        'performance',
        insight.executiveSummary,
        JSON.stringify(insight.recommendations),
      ]
    );

    res.json({
      ...saved.rows[0],
      structured_insights: insight.sections,
      ai_confidence: insight.sections.aiConfidence,
    });
  } catch (error) {
    console.error('AI insight generation error:', error);

    res.status(500).json({
      error: 'Failed to generate AI insights',
    });
  }
});

router.get('/:clientId', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT *
       FROM ai_insights
       WHERE client_id = $1
       AND agency_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.params.clientId, req.user.agency_id]
    );

    res.json(result.rows[0] || null);
  } catch (error) {
    console.error('Fetch AI insights error:', error);

    res.status(500).json({
      error: 'Failed to fetch AI insights',
    });
  }
});

module.exports = router;
