// dashboard.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

const agencyAggregateMetricsCte = `
  WITH chosen_months AS (
    SELECT
      pd.client_id,
      pd.report_month,
      SUM(COALESCE(pd.spend, 0)) AS spend,
      SUM(COALESCE(pd.impressions, 0)) AS impressions,
      SUM(COALESCE(pd.clicks, 0)) AS clicks,
      SUM(COALESCE(pd.conversions, 0)) AS conversions,
      SUM(COALESCE(pd.revenue, 0)) AS revenue
    FROM performance_data pd
    JOIN clients c ON pd.client_id = c.id
    WHERE c.agency_id = $1
      AND c.is_active = TRUE
      AND LOWER(TRIM(COALESCE(pd.external_campaign_name, ''))) = 'aggregate'
    GROUP BY pd.client_id, pd.report_month
  )
`;

router.get('/overview', async (req, res) => {
  try {
    const agencyId = req.user.agency_id;

    // 🔥 ALL QUERIES
    const [
      clientsResult,
      recentDataResult,
      topClientsResult,
      summaryResult
    ] = await Promise.all([

      // Total Clients
      db.query(
        'SELECT COUNT(*) as count FROM clients WHERE agency_id=$1 AND is_active=TRUE',
        [agencyId]
      ),

      // Recent Activity
      db.query(
        `SELECT pd.*, c.name as client_name
         FROM performance_data pd
         JOIN clients c ON pd.client_id = c.id
         WHERE c.agency_id = $1
         ORDER BY pd.created_at DESC LIMIT 5`,
        [agencyId]
      ),

      // Top Clients
      db.query(
        `${agencyAggregateMetricsCte}
         SELECT
           c.id,
           c.name,
           SUM(COALESCE(cm.spend, 0)) as total_spend,
           SUM(COALESCE(cm.conversions, 0)) as total_conversions,
           CASE
             WHEN SUM(COALESCE(cm.spend, 0)) > 0
             THEN SUM(COALESCE(cm.revenue, 0)) / SUM(COALESCE(cm.spend, 0))
             ELSE 0
           END as roas
         FROM clients c
         LEFT JOIN chosen_months cm
           ON cm.client_id = c.id
         WHERE c.agency_id = $1
         AND c.is_active = TRUE
         GROUP BY c.id, c.name
         ORDER BY SUM(COALESCE(cm.spend, 0)) DESC NULLS LAST
         LIMIT 5`,
        [agencyId]
      ),

      // 🔥 KPI SUMMARY QUERY
     db.query(
       `${agencyAggregateMetricsCte}
        SELECT
         SUM(COALESCE(spend, 0)) as spend,
         SUM(COALESCE(impressions, 0)) as impressions,
         SUM(COALESCE(clicks, 0)) as clicks,
         SUM(COALESCE(conversions, 0)) as conversions,
         SUM(COALESCE(revenue, 0)) as revenue
        FROM chosen_months`,
       [agencyId]
     )
    ]);

    // 🔥 SUMMARY DATA
    const summary = summaryResult.rows[0] || {};

    const spend = parseFloat(summary.spend || 0);
    const impressions = parseFloat(summary.impressions || 0);
    const clicks = parseFloat(summary.clicks || 0);
    const conversions = parseFloat(summary.conversions || 0);
    const revenue = parseFloat(summary.revenue || 0);

    // 🔥 KPI CALCULATIONS
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpl = conversions > 0 ? spend / conversions : 0; // using conversions as leads
    const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0;
    const roas = spend > 0 ? revenue / spend : 0;

    // ✅ FINAL RESPONSE
    res.json({
      totalClients: parseInt(clientsResult.rows[0].count),
      recentActivity: recentDataResult.rows,
      topClients: topClientsResult.rows,

      spend,
      impressions,
      clicks,
      conversions,
      revenue,

      ctr,
      cpc,
      cpl,
      conversionRate,
      roas,
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

module.exports = router;
