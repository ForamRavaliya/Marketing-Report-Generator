// dashboard.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { allResultsSql, calculateDerivedMetrics, primaryOutcomeSql, qualifiedLeadSql, safeNumber } = require('../utils/metrics');

router.use(authenticate);

const agencyAggregateMetricsCte = `
  WITH campaign_semantics AS (
    SELECT
      pd.client_id,
      pd.report_month,
      SUM(${primaryOutcomeSql('pd')}) AS campaign_conversions,
      SUM(${qualifiedLeadSql('pd')}) AS campaign_qualified_leads,
      SUM(${allResultsSql('pd')}) AS campaign_all_results
    FROM performance_data pd
    JOIN clients c ON pd.client_id = c.id
    WHERE c.agency_id = $1
      AND c.is_active = TRUE
      AND LOWER(TRIM(COALESCE(pd.external_campaign_name, ''))) <> 'aggregate'
    GROUP BY pd.client_id, pd.report_month
  ),
  chosen_months AS (
    SELECT
      pd.client_id,
      pd.report_month,
      SUM(COALESCE(pd.spend, 0)) AS spend,
      SUM(COALESCE(pd.impressions, 0)) AS impressions,
      SUM(COALESCE(pd.clicks, 0)) AS clicks,
      SUM(
        CASE
          WHEN COALESCE(pd.raw_data->>'source', '') = 'campaign_sum'
            AND COALESCE(cs.campaign_all_results, 0) > 0
          THEN COALESCE(cs.campaign_conversions, 0)
          ELSE ${primaryOutcomeSql('pd')}
        END
      ) AS conversions,
      SUM(
        CASE
          WHEN COALESCE(pd.raw_data->>'source', '') = 'campaign_sum'
            AND COALESCE(cs.campaign_all_results, 0) > 0
          THEN COALESCE(cs.campaign_qualified_leads, 0)
          ELSE ${qualifiedLeadSql('pd')}
        END
      ) AS qualified_leads,
      SUM(
        CASE
          WHEN COALESCE(pd.raw_data->>'source', '') = 'campaign_sum'
            AND COALESCE(cs.campaign_all_results, 0) > 0
          THEN COALESCE(cs.campaign_all_results, 0)
          ELSE ${allResultsSql('pd')}
        END
      ) AS all_results,
      SUM(COALESCE(pd.revenue, 0)) AS revenue
    FROM performance_data pd
    JOIN clients c ON pd.client_id = c.id
    LEFT JOIN campaign_semantics cs
      ON cs.client_id = pd.client_id
     AND cs.report_month = pd.report_month
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
           SUM(COALESCE(cm.qualified_leads, 0)) as total_qualified_leads,
           SUM(COALESCE(cm.all_results, 0)) as total_all_results,
           SUM(COALESCE(cm.revenue, 0)) as total_revenue
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
         SUM(COALESCE(qualified_leads, 0)) as qualified_leads,
         SUM(COALESCE(all_results, 0)) as all_results,
         SUM(COALESCE(revenue, 0)) as revenue
        FROM chosen_months`,
       [agencyId]
     )
    ]);

    // 🔥 SUMMARY DATA
    const summary = summaryResult.rows[0] || {};
    const topClients = topClientsResult.rows.map((client) => ({
      ...client,
      total_qualified_leads: safeNumber(client.total_qualified_leads),
      total_all_results: safeNumber(client.total_all_results),
      roas: calculateDerivedMetrics({
        spend: client.total_spend,
        conversions: client.total_conversions,
        revenue: client.total_revenue,
      }).roas,
    }));

    const spend = safeNumber(summary.spend);
    const impressions = safeNumber(summary.impressions);
    const clicks = safeNumber(summary.clicks);
    const conversions = safeNumber(summary.conversions);
    const qualifiedLeads = safeNumber(summary.qualified_leads);
    const allResults = safeNumber(summary.all_results);
    const revenue = safeNumber(summary.revenue);

    // 🔥 KPI CALCULATIONS
    const derived = calculateDerivedMetrics({
      spend,
      impressions,
      clicks,
      conversions,
      qualified_leads: qualifiedLeads,
      all_results: allResults,
      revenue,
    });

    // ✅ FINAL RESPONSE
    res.json({
      totalClients: parseInt(clientsResult.rows[0].count),
      recentActivity: recentDataResult.rows,
      topClients,

      spend,
      impressions,
      clicks,
      conversions,
      revenue,

      ctr: derived.ctr,
      cpc: derived.cpc,
      cpl: derived.cpl,
      conversionRate: derived.conversionRate,
      roas: derived.roas,
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

module.exports = router;
