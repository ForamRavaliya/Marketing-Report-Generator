const express = require('express');
const router = express.Router();

const db = require('../db');
const { authenticate } = require('../middleware/auth');
const {
  getSummaryMetrics,
  getPlatformMetrics,
  getCampaignMetrics,
  safeNumber,
} = require('../utils/metrics');

router.use(authenticate);

const safeNum = (value) => safeNumber(value, 0);

const getPerformanceLevel = (roas, ctr, conversions) => {
  if (roas >= 4 && ctr >= 2 && conversions >= 100) return 'excellent';
  if (roas >= 2 && ctr >= 1 && conversions >= 30) return 'strong';
  if (roas >= 1) return 'moderate';
  return 'needs improvement';
};

router.post('/generate/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;

    const metrics = await getSummaryMetrics(db, { clientId });

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
    const ctr = safeNum(metrics.ctr);
    const cpc = safeNum(metrics.cpc);
    const cpa = safeNum(metrics.cpa);
    const roas = safeNum(metrics.roas);

    const [platformRows, campaignRows] = await Promise.all([
      getPlatformMetrics(db, { clientId }),
      getCampaignMetrics(db, { clientId }),
    ]);

    const bestPlatform = [...platformRows].sort((a, b) => safeNum(b.roas) - safeNum(a.roas))[0];
    const bestCampaign = [...campaignRows].sort((a, b) => safeNum(b.roas) - safeNum(a.roas))[0];

    const recommendations = [];

    if (revenue === 0) {
      recommendations.push(
        'Revenue data is missing in the uploaded reports, so ROAS cannot be calculated accurately. Map or upload revenue values to enable profit-based performance analysis.'
      );
    }

    if (roas === 0) {
      recommendations.push(
        'ROAS is currently 0.00x because revenue is not available. Once revenue data is added, the system can identify high-return campaigns and budget scaling opportunities.'
      );
    }

    if (platformRows.length === 1) {
      recommendations.push(
        'Only one advertising platform has tracked spend. Upload Google Ads, LinkedIn Ads, or other platform data to compare budget allocation and channel performance.'
      );
    }

    if (revenue > 0 && roas < 2) {
      recommendations.push(
        'ROAS is below the ideal level. Review campaign targeting, offer quality, landing pages, and budget allocation.'
      );
    }

    if (clicks > 0 && ctr < 1) {
      recommendations.push(
        'CTR is low. Test stronger headlines, clearer CTAs, short-form creatives, and better audience segmentation.'
      );
    }

    if (clicks === 0) {
      recommendations.push(
        'Click and CTR data were not available in the uploaded report. Include click metrics in future exports to evaluate engagement accurately.'
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

  if (bestPlatform && safeNum(bestPlatform.spend) > 0) {
    recommendations.push(
      `${String(bestPlatform.platform || 'Platform').toUpperCase()} is the top tracked platform by spend. Review its CTR, CPA, and conversion quality before increasing budget.`
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

    const finalRecommendations = recommendations.slice(0, 6);
    const performanceLevel = getPerformanceLevel(roas, ctr, conversions);

    const clickText =
      clicks > 0
        ? `${clicks.toLocaleString()} clicks`
        : 'click data was not available';

    const summary =
      `Campaigns generated ${clickText}, ` +
      `${conversions.toLocaleString()} conversions, and total spend of INR ${spend.toLocaleString('en-IN', {
        maximumFractionDigits: 2,
      })}. ` +
      `CTR is ${ctr.toFixed(2)}%, CPC is INR ${cpc.toFixed(2)}, and CPA is INR ${cpa.toFixed(2)}. ` +
      (
        revenue > 0
          ? `Revenue is INR ${revenue.toLocaleString('en-IN', {
              maximumFractionDigits: 2,
            })} with ROAS ${roas.toFixed(2)}x. Overall performance is ${performanceLevel}.`
          : `Revenue data is not available, so ROAS cannot be evaluated yet. Overall lead-generation performance is ${performanceLevel}.`
      );

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
