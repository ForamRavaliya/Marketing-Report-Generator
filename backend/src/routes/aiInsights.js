const express = require('express');
const router = express.Router();

const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

const safeNum = (value) => Number(value || 0);

const getPerformanceLevel = (roas, ctr, conversions) => {
  if (roas >= 4 && ctr >= 2 && conversions >= 100) return 'excellent';
  if (roas >= 2 && ctr >= 1 && conversions >= 30) return 'strong';
  if (roas >= 1) return 'moderate';
  return 'needs improvement';
};

router.post('/generate/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;

    const performanceResult = await db.query(
      `SELECT
         SUM(COALESCE(spend, 0)) AS spend,
         SUM(COALESCE(impressions, 0)) AS impressions,
         SUM(COALESCE(clicks, 0)) AS clicks,
         SUM(COALESCE(conversions, 0)) AS conversions,
         SUM(COALESCE(revenue, 0)) AS revenue
       FROM performance_data
       WHERE client_id = $1`,
      [clientId]
    );

    const metrics = performanceResult.rows[0];

    if (!metrics || safeNum(metrics.spend) === 0) {
      return res.status(404).json({
        error: 'No performance data found',
      });
    }

    const spend = safeNum(metrics.spend);
    const impressions = safeNum(metrics.impressions);
    const clicks = safeNum(metrics.clicks);
    const conversions = safeNum(metrics.conversions);
    const revenue = safeNum(metrics.revenue);

    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpa = conversions > 0 ? spend / conversions : 0;
    const roas = spend > 0 ? revenue / spend : 0;

    const platformResult = await db.query(
      `SELECT
         platform,
         SUM(COALESCE(spend, 0)) AS spend,
         SUM(COALESCE(clicks, 0)) AS clicks,
         SUM(COALESCE(conversions, 0)) AS conversions,
         SUM(COALESCE(revenue, 0)) AS revenue,
         CASE
           WHEN SUM(COALESCE(spend, 0)) > 0
           THEN SUM(COALESCE(revenue, 0)) / SUM(COALESCE(spend, 0))
           ELSE 0
         END AS roas
       FROM performance_data
       WHERE client_id = $1
       GROUP BY platform
       ORDER BY roas DESC`,
      [clientId]
    );

    const campaignResult = await db.query(
      `SELECT
         c.name,
         pd.platform,
         SUM(COALESCE(pd.spend, 0)) AS spend,
         SUM(COALESCE(pd.clicks, 0)) AS clicks,
         SUM(COALESCE(pd.conversions, 0)) AS conversions,
         SUM(COALESCE(pd.revenue, 0)) AS revenue,
         CASE
           WHEN SUM(COALESCE(pd.spend, 0)) > 0
           THEN SUM(COALESCE(pd.revenue, 0)) / SUM(COALESCE(pd.spend, 0))
           ELSE 0
         END AS roas
       FROM performance_data pd
       LEFT JOIN campaigns c ON pd.campaign_id = c.id
       WHERE pd.client_id = $1
       GROUP BY c.name, pd.platform
       ORDER BY roas DESC
       LIMIT 5`,
      [clientId]
    );

    const bestPlatform = platformResult.rows[0];
    const bestCampaign = campaignResult.rows[0];

    const recommendations = [];

    if (roas < 2) {
      recommendations.push(
        'ROAS is below the ideal level. Review low-performing campaigns and improve audience targeting, creatives, and landing pages.'
      );
    }

    if (ctr < 1) {
      recommendations.push(
        'CTR is low. Test stronger headlines, clearer CTAs, short-form video creatives, and better audience segmentation.'
      );
    }

    if (conversions < 50) {
      recommendations.push(
        'Conversion volume is low. Improve landing page speed, form simplicity, and offer clarity to increase lead generation.'
      );
    }

    if (cpa > 1000) {
      recommendations.push(
        'CPA is high. Reduce spend on expensive campaigns and shift budget toward campaigns with lower cost per conversion.'
      );
    }

    if (spend > 5000 && roas > 4) {
      recommendations.push(
        'High spend is producing strong returns. Consider scaling budget gradually on the best-performing campaigns.'
      );
    }

    if (bestPlatform) {
      recommendations.push(
        `${String(bestPlatform.platform).toUpperCase()} is currently the strongest platform by ROAS. Allocate more budget there while monitoring CPA.`
      );
    }

    if (bestCampaign?.name) {
      recommendations.push(
        `"${bestCampaign.name}" is one of the best-performing campaigns. Use its audience, creative, and messaging pattern for future campaigns.`
      );
    }

    recommendations.push(
      'Retarget existing website visitors and engaged users to improve conversion efficiency and ROAS.'
    );

    const finalRecommendations = recommendations.slice(0, 5);

    const performanceLevel = getPerformanceLevel(roas, ctr, conversions);

    const summary =
      `Campaigns generated ${clicks.toLocaleString()} clicks, ` +
      `${conversions.toLocaleString()} conversions, and revenue of INR ${revenue.toLocaleString('en-IN', {
        maximumFractionDigits: 2,
      })}. ` +
      `Overall performance is ${performanceLevel} with CTR ${ctr.toFixed(2)}%, ` +
      `CPA INR ${cpa.toFixed(2)}, and ROAS ${roas.toFixed(2)}x.`;

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
        summary,
        JSON.stringify(finalRecommendations),
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