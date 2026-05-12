const express = require('express');
const router = express.Router();



const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);



// Generate AI insights
router.post('/generate/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;

    // Get latest performance data
    const performanceResult = await db.query(
      `SELECT
         SUM(spend) AS spend,
         SUM(impressions) AS impressions,
         SUM(clicks) AS clicks,
         SUM(conversions) AS conversions,
         SUM(revenue) AS revenue
       FROM performance_data
       WHERE client_id = $1`,
      [clientId]
    );

    const metrics = performanceResult.rows[0];

    if (!metrics) {
      return res.status(404).json({
        error: 'No performance data found',
      });
    }

    const ctr =
      Number(metrics.impressions || 0) > 0
        ? (
            (Number(metrics.clicks || 0) /
              Number(metrics.impressions || 1)) *
            100
          ).toFixed(2)
        : 0;

    const cpa =
      Number(metrics.conversions || 0) > 0
        ? (
            Number(metrics.spend || 0) /
            Number(metrics.conversions || 1)
          ).toFixed(2)
        : 0;

    const roas =
      Number(metrics.spend || 0) > 0
        ? (
            Number(metrics.revenue || 0) /
            Number(metrics.spend || 1)
          ).toFixed(2)
        : 0;

    const prompt = `
You are a senior digital marketing strategist.

Analyze these marketing metrics and provide:
1. Performance summary
2. 3 actionable recommendations

Metrics:
Spend: ${metrics.spend}
Impressions: ${metrics.impressions}
Clicks: ${metrics.clicks}
Conversions: ${metrics.conversions}
Revenue: ${metrics.revenue}
CTR: ${ctr}%
CPA: ${cpa}
ROAS: ${roas}

Respond ONLY in JSON format:

{
  "summary": "short summary",
  "recommendations": [
    "recommendation 1",
    "recommendation 2",
    "recommendation 3"
  ]
}
`;

    const mockRecommendations = [];

    if (Number(roas) < 2) {
      mockRecommendations.push(
        'ROAS is below target. Consider improving audience targeting and ad creatives.'
      );
    }

    if (Number(ctr) < 2) {
      mockRecommendations.push(
        'CTR is relatively low. Test stronger CTA headlines and engaging creatives.'
      );
    }

    if (Number(cpa) > 1000) {
      mockRecommendations.push(
        'CPA is high. Optimize campaigns with better conversion-focused landing pages.'
      );
    }

    if (mockRecommendations.length === 0) {
      mockRecommendations.push(
        'Campaign performance looks healthy. Consider scaling high-performing campaigns.'
      );

      mockRecommendations.push(
        'Meta campaigns are showing stable engagement and conversion quality.'
      );

      mockRecommendations.push(
        'Try allocating additional budget toward top-performing audiences.'
      );
    }

    const aiResponse = {
      summary: `
    Campaign generated ${metrics.clicks || 0} clicks and ${
        metrics.conversions || 0
      } conversions with a ROAS of ${roas}x.

    Overall performance is ${
        Number(roas) >= 2 ? 'strong' : 'moderate'
      } based on current campaign metrics.
      `,
      recommendations: mockRecommendations,
    };
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
        aiResponse.summary,
        JSON.stringify(aiResponse.recommendations),
      ]
    );

    res.json(saved.rows[0]);
  } catch (error) {
    console.error('AI insight generation error:', error);

    res.status(500).json({
      error: 'Failed to generate AI insights',
    });
  }
});

// Get latest AI insights
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