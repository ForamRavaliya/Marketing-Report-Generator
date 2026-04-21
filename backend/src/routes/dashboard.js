// dashboard.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

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
        `SELECT c.id, c.name,
          SUM(pd.spend) as total_spend,
          SUM(pd.conversions) as total_conversions,
          CASE WHEN SUM(pd.spend) > 0 THEN SUM(pd.revenue) / SUM(pd.spend) ELSE 0 END as roas
         FROM clients c
         LEFT JOIN performance_data pd ON pd.client_id = c.id
         WHERE c.agency_id = $1 AND c.is_active=TRUE
         GROUP BY c.id, c.name
         ORDER BY SUM(pd.spend) DESC NULLS LAST LIMIT 5`,
        [agencyId]
      ),

      // 🔥 KPI SUMMARY QUERY
      db.query(
        `SELECT
          SUM(spend) as spend,
          SUM(impressions) as impressions,
          SUM(clicks) as clicks,
          SUM(conversions) as conversions,
          SUM(revenue) as revenue
         FROM performance_data pd
         JOIN clients c ON pd.client_id = c.id
         WHERE c.agency_id = $1`,
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

      // 🔥 KPI DATA
      ctr,
      cpc,
      cpl,
      conversionRate,
      roas
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

module.exports = router;