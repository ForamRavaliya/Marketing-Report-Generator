// dashboard.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

const dedupedAgencyMetricsCte = `
  WITH base_rows AS (
    SELECT pd.*
    FROM performance_data pd
    JOIN clients c ON pd.client_id = c.id
    WHERE c.agency_id = $1
      AND c.is_active = TRUE
  ),
  monthly_rollup AS (
    SELECT
      client_id,
      report_month,
      BOOL_OR(LOWER(TRIM(COALESCE(external_campaign_name, ''))) = 'aggregate') AS has_aggregate,
      BOOL_OR(LOWER(TRIM(COALESCE(external_campaign_name, ''))) <> 'aggregate') AS has_campaign,
      SUM(COALESCE(spend, 0)) FILTER (WHERE LOWER(TRIM(COALESCE(external_campaign_name, ''))) = 'aggregate') AS aggregate_spend,
      SUM(COALESCE(impressions, 0)) FILTER (WHERE LOWER(TRIM(COALESCE(external_campaign_name, ''))) = 'aggregate') AS aggregate_impressions,
      SUM(COALESCE(clicks, 0)) FILTER (WHERE LOWER(TRIM(COALESCE(external_campaign_name, ''))) = 'aggregate') AS aggregate_clicks,
      SUM(COALESCE(conversions, 0)) FILTER (WHERE LOWER(TRIM(COALESCE(external_campaign_name, ''))) = 'aggregate') AS aggregate_conversions,
      SUM(COALESCE(revenue, 0)) FILTER (WHERE LOWER(TRIM(COALESCE(external_campaign_name, ''))) = 'aggregate') AS aggregate_revenue,
      SUM(COALESCE(spend, 0)) FILTER (WHERE LOWER(TRIM(COALESCE(external_campaign_name, ''))) <> 'aggregate') AS campaign_spend,
      SUM(COALESCE(impressions, 0)) FILTER (WHERE LOWER(TRIM(COALESCE(external_campaign_name, ''))) <> 'aggregate') AS campaign_impressions,
      SUM(COALESCE(clicks, 0)) FILTER (WHERE LOWER(TRIM(COALESCE(external_campaign_name, ''))) <> 'aggregate') AS campaign_clicks,
      SUM(COALESCE(conversions, 0)) FILTER (WHERE LOWER(TRIM(COALESCE(external_campaign_name, ''))) <> 'aggregate') AS campaign_conversions,
      SUM(COALESCE(revenue, 0)) FILTER (WHERE LOWER(TRIM(COALESCE(external_campaign_name, ''))) <> 'aggregate') AS campaign_revenue
    FROM base_rows
    GROUP BY client_id, report_month
  ),
  chosen_months AS (
    SELECT
      client_id,
      CASE
        WHEN has_aggregate AND has_campaign AND (
          (COALESCE(campaign_spend, 0) > 0 AND COALESCE(aggregate_spend, 0) BETWEEN campaign_spend * 1.8 AND campaign_spend * 2.2)
          OR (COALESCE(campaign_conversions, 0) > 0 AND COALESCE(aggregate_conversions, 0) BETWEEN campaign_conversions * 1.8 AND campaign_conversions * 2.2)
          OR (COALESCE(campaign_revenue, 0) > 0 AND COALESCE(aggregate_revenue, 0) BETWEEN campaign_revenue * 1.8 AND campaign_revenue * 2.2)
        )
        THEN COALESCE(campaign_spend, 0)
        WHEN has_aggregate THEN COALESCE(aggregate_spend, 0)
        ELSE COALESCE(campaign_spend, 0)
      END AS spend,
      CASE
        WHEN has_aggregate AND has_campaign AND (
          (COALESCE(campaign_spend, 0) > 0 AND COALESCE(aggregate_spend, 0) BETWEEN campaign_spend * 1.8 AND campaign_spend * 2.2)
          OR (COALESCE(campaign_conversions, 0) > 0 AND COALESCE(aggregate_conversions, 0) BETWEEN campaign_conversions * 1.8 AND campaign_conversions * 2.2)
          OR (COALESCE(campaign_revenue, 0) > 0 AND COALESCE(aggregate_revenue, 0) BETWEEN campaign_revenue * 1.8 AND campaign_revenue * 2.2)
        )
        THEN COALESCE(campaign_impressions, 0)
        WHEN has_aggregate THEN COALESCE(aggregate_impressions, 0)
        ELSE COALESCE(campaign_impressions, 0)
      END AS impressions,
      CASE
        WHEN has_aggregate AND has_campaign AND (
          (COALESCE(campaign_spend, 0) > 0 AND COALESCE(aggregate_spend, 0) BETWEEN campaign_spend * 1.8 AND campaign_spend * 2.2)
          OR (COALESCE(campaign_conversions, 0) > 0 AND COALESCE(aggregate_conversions, 0) BETWEEN campaign_conversions * 1.8 AND campaign_conversions * 2.2)
          OR (COALESCE(campaign_revenue, 0) > 0 AND COALESCE(aggregate_revenue, 0) BETWEEN campaign_revenue * 1.8 AND campaign_revenue * 2.2)
        )
        THEN COALESCE(campaign_clicks, 0)
        WHEN has_aggregate THEN COALESCE(aggregate_clicks, 0)
        ELSE COALESCE(campaign_clicks, 0)
      END AS clicks,
      CASE
        WHEN has_aggregate AND has_campaign AND (
          (COALESCE(campaign_spend, 0) > 0 AND COALESCE(aggregate_spend, 0) BETWEEN campaign_spend * 1.8 AND campaign_spend * 2.2)
          OR (COALESCE(campaign_conversions, 0) > 0 AND COALESCE(aggregate_conversions, 0) BETWEEN campaign_conversions * 1.8 AND campaign_conversions * 2.2)
          OR (COALESCE(campaign_revenue, 0) > 0 AND COALESCE(aggregate_revenue, 0) BETWEEN campaign_revenue * 1.8 AND campaign_revenue * 2.2)
        )
        THEN COALESCE(campaign_conversions, 0)
        WHEN has_aggregate THEN COALESCE(aggregate_conversions, 0)
        ELSE COALESCE(campaign_conversions, 0)
      END AS conversions,
      CASE
        WHEN has_aggregate AND has_campaign AND (
          (COALESCE(campaign_spend, 0) > 0 AND COALESCE(aggregate_spend, 0) BETWEEN campaign_spend * 1.8 AND campaign_spend * 2.2)
          OR (COALESCE(campaign_conversions, 0) > 0 AND COALESCE(aggregate_conversions, 0) BETWEEN campaign_conversions * 1.8 AND campaign_conversions * 2.2)
          OR (COALESCE(campaign_revenue, 0) > 0 AND COALESCE(aggregate_revenue, 0) BETWEEN campaign_revenue * 1.8 AND campaign_revenue * 2.2)
        )
        THEN COALESCE(campaign_revenue, 0)
        WHEN has_aggregate THEN COALESCE(aggregate_revenue, 0)
        ELSE COALESCE(campaign_revenue, 0)
      END AS revenue
    FROM monthly_rollup
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
        `${dedupedAgencyMetricsCte}
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
       `${dedupedAgencyMetricsCte}
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
