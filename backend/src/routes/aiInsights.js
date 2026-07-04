const express = require('express');
const router = express.Router();

const db = require('../db');
const { authenticate } = require('../middleware/auth');
const {
  getSummaryMetrics,
  getPlatformMetrics,
  getCampaignMetrics,
  getMonthlyTrends,
  calculatePercentChange,
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

const formatPct = (value) => `${Math.abs(Number(value || 0)).toFixed(1)}%`;
const directionText = (value, up = 'increased', down = 'decreased') =>
  Number(value || 0) >= 0 ? up : down;

const metricChangeText = (metric, change, reason) => {
  if (!change?.hasPreviousData || change.value === null) return null;
  return `${metric} ${directionText(change.value)} by ${formatPct(change.value)}. ${reason}`;
};

const getReportLabels = (reportType, revenue, conversions) => {
  const isSales =
    reportType === 'sales_campaign' ||
    reportType === 'sales_data' ||
    (Number(revenue || 0) > 0 && Number(conversions || 0) > 0);

  return isSales
    ? { outcome: 'Purchases', cost: 'CPA', reportName: 'sales' }
    : { outcome: 'Leads', cost: 'CPL', reportName: 'lead generation' };
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

    const [platformRows, campaignRows, trends] = await Promise.all([
      getPlatformMetrics(db, { clientId }),
      getCampaignMetrics(db, { clientId }),
      getMonthlyTrends(db, { clientId }),
    ]);

    const latestMonth = trends.length > 0 ? trends[trends.length - 1] : null;
    const previousMonth = trends.length > 1 ? trends[trends.length - 2] : null;
    const labels = getReportLabels(metrics.report_type, revenue, conversions);
    const bestPlatform = [...platformRows].sort((a, b) => safeNum(b.spend) - safeNum(a.spend))[0];
    const bestCampaign = [...campaignRows].sort((a, b) => safeNum(b.conversions) - safeNum(a.conversions) || safeNum(a.cpa) - safeNum(b.cpa))[0];
    const worstCampaign = [...campaignRows]
      .filter((campaign) => safeNum(campaign.spend) > 0 || safeNum(campaign.conversions) > 0)
      .sort((a, b) => safeNum(b.cpa) - safeNum(a.cpa) || safeNum(a.conversions) - safeNum(b.conversions))[0];
    const highestSpendCampaign = [...campaignRows].sort((a, b) => safeNum(b.spend) - safeNum(a.spend))[0];

    const recommendations = [];

    if (latestMonth && previousMonth) {
      const spendChange = calculatePercentChange(latestMonth.spend, previousMonth.spend);
      const conversionChange = calculatePercentChange(latestMonth.conversions, previousMonth.conversions);
      const clickChange = calculatePercentChange(latestMonth.clicks, previousMonth.clicks);
      const impressionChange = calculatePercentChange(latestMonth.impressions, previousMonth.impressions);
      const cpcChange = calculatePercentChange(latestMonth.cpc, previousMonth.cpc);
      const cpaChange = calculatePercentChange(latestMonth.cpa, previousMonth.cpa);
      const ctrChange = calculatePercentChange(latestMonth.ctr, previousMonth.ctr);
      const roasChange = calculatePercentChange(latestMonth.roas, previousMonth.roas);
      const revenueChange = calculatePercentChange(latestMonth.revenue, previousMonth.revenue);

      const spendVsOutcome = metricChangeText(
        `Spend and ${labels.outcome}`,
        conversionChange,
        `Spend ${spendChange.value !== null ? directionText(spendChange.value) + ` by ${formatPct(spendChange.value)}` : 'had no previous-month baseline'}, while ${labels.outcome.toLowerCase()} ${directionText(conversionChange.value)}.`
      );
      if (spendVsOutcome) recommendations.push(spendVsOutcome);

      if (cpcChange.hasPreviousData) {
        recommendations.push(
          metricChangeText(
            'CPC',
            cpcChange,
            clickChange.hasPreviousData && spendChange.hasPreviousData
              ? `Clicks ${directionText(clickChange.value)} by ${formatPct(clickChange.value)} while spend ${directionText(spendChange.value)} by ${formatPct(spendChange.value)}.`
              : 'This is based on the imported spend and click totals.'
          )
        );
      }

      if (cpaChange.hasPreviousData) {
        recommendations.push(
          metricChangeText(
            labels.cost,
            cpaChange,
            conversionChange.hasPreviousData && spendChange.hasPreviousData
              ? `${labels.outcome} ${directionText(conversionChange.value)} by ${formatPct(conversionChange.value)} while spend ${directionText(spendChange.value)} by ${formatPct(spendChange.value)}.`
              : 'This is based on spend divided by imported conversions.'
          )
        );
      }

      if (ctrChange.hasPreviousData) {
        recommendations.push(
          metricChangeText(
            'CTR',
            ctrChange,
            impressionChange.hasPreviousData && clickChange.hasPreviousData
              ? `Impressions ${directionText(impressionChange.value)} by ${formatPct(impressionChange.value)} while clicks ${directionText(clickChange.value)} by ${formatPct(clickChange.value)}.`
              : 'This is based on imported clicks and impressions.'
          )
        );
      }

      if (revenue > 0 && roasChange.hasPreviousData) {
        recommendations.push(
          metricChangeText(
            'ROAS',
            roasChange,
            revenueChange.hasPreviousData && spendChange.hasPreviousData
              ? `Revenue ${directionText(revenueChange.value)} by ${formatPct(revenueChange.value)} while spend ${directionText(spendChange.value)} by ${formatPct(spendChange.value)}.`
              : 'This is based on imported revenue divided by spend.'
          )
        );
      }
    } else {
      recommendations.push('No previous month data is available, so month-over-month change explanations were not generated.');
    }

    if (revenue === 0) {
      recommendations.push('Revenue is unavailable in the imported data, therefore ROAS cannot be calculated.');
    }

    if (bestCampaign?.name) {
      recommendations.push(`Top performing campaign by ${labels.outcome.toLowerCase()} is "${bestCampaign.name}" with ${safeNum(bestCampaign.conversions).toLocaleString()} ${labels.outcome.toLowerCase()}.`);
    }

    if (worstCampaign?.name && safeNum(worstCampaign.cpa) > 0) {
      recommendations.push(`Lowest efficiency campaign is "${worstCampaign.name}" based on ${labels.cost} of INR ${safeNum(worstCampaign.cpa).toFixed(2)}.`);
    }

    if (highestSpendCampaign?.name) {
      recommendations.push(`Highest spend campaign is "${highestSpendCampaign.name}" with INR ${safeNum(highestSpendCampaign.spend).toLocaleString('en-IN', { maximumFractionDigits: 2 })} spend.`);
    }

    if (bestPlatform && safeNum(bestPlatform.spend) > 0) {
      recommendations.push(`${String(bestPlatform.platform || 'Platform').toUpperCase()} has the highest tracked spend at INR ${safeNum(bestPlatform.spend).toLocaleString('en-IN', { maximumFractionDigits: 2 })}.`);
    }

    const finalRecommendations = recommendations.filter(Boolean).slice(0, 8);
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
          : `Revenue data is not available, so ROAS cannot be evaluated. Overall ${labels.reportName} performance is ${performanceLevel}.`
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
