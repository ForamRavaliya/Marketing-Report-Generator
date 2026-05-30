const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

router.use(authenticate);
router.use(requireSuperAdmin);

router.get('/overview', async (req, res) => {
  try {
    const [
      totalsResult,
      revenueResult,
      agenciesResult,
      planStatsResult,
      paymentsResult,
    ] = await Promise.all([
      db.query(`
        SELECT
          (SELECT COUNT(*)::int FROM agencies) AS agencies,
          (SELECT COUNT(*)::int FROM users) AS users,
          (SELECT COUNT(*)::int FROM clients) AS clients,
          (SELECT COUNT(*)::int FROM generated_reports) AS reports,
          (SELECT COUNT(*)::int FROM subscriptions WHERE status = 'active') AS active_subscriptions
      `),

      db.query(`
        SELECT
          COALESCE(SUM(
            CASE
              WHEN plan_name = 'pro' THEN 999
              WHEN plan_name = 'agency' THEN 2999
              ELSE 0
            END
          ), 0)::int AS monthly_revenue
        FROM subscriptions
        WHERE status = 'active'
      `),

      db.query(`
        SELECT
          a.id,
          a.name,
          a.logo_url,
          a.created_at,
          (
            SELECT u.email
            FROM users u
            WHERE u.agency_id = a.id
            ORDER BY
              CASE WHEN u.role = 'admin' THEN 0 ELSE 1 END,
              u.id ASC
            LIMIT 1
          ) AS owner_email,
          COALESCE((
            SELECT s.plan_name
            FROM subscriptions s
            WHERE s.agency_id = a.id
            ORDER BY s.created_at DESC
            LIMIT 1
          ), 'free') AS plan_name,
          COALESCE((
            SELECT s.status
            FROM subscriptions s
            WHERE s.agency_id = a.id
            ORDER BY s.created_at DESC
            LIMIT 1
          ), 'active') AS subscription_status,
          (
            SELECT COUNT(*)::int
            FROM clients c
            WHERE c.agency_id = a.id
          ) AS clients_count,
          (
            SELECT COUNT(*)::int
            FROM generated_reports gr
            WHERE gr.agency_id = a.id
          ) AS reports_count
        FROM agencies a
        ORDER BY a.created_at DESC
        LIMIT 20
      `),

      db.query(`
        SELECT
          COALESCE(plan_name, 'free') AS plan_name,
          COUNT(*)::int AS total
        FROM subscriptions
        GROUP BY plan_name
        ORDER BY total DESC
      `),

      db.query(`
        SELECT
          p.id,
          p.amount,
          p.currency,
          p.status,
          p.created_at,
          a.name AS agency_name
        FROM payments p
        LEFT JOIN agencies a ON a.id = p.agency_id
        ORDER BY p.created_at DESC
        LIMIT 8
      `),
    ]);

    res.json({
      totals: {
        agencies: totalsResult.rows[0].agencies,
        users: totalsResult.rows[0].users,
        clients: totalsResult.rows[0].clients,
        reports: totalsResult.rows[0].reports,
        activeSubscriptions: totalsResult.rows[0].active_subscriptions,
        monthlyRevenue: revenueResult.rows[0].monthly_revenue,
      },
      agencies: agenciesResult.rows,
      planStats: planStatsResult.rows,
      recentPayments: paymentsResult.rows,
    });
  } catch (error) {
    console.error('Super admin overview error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/agencies/:agencyId/plan', async (req, res) => {
  try {
    const { agencyId } = req.params;
    const { planName, status = 'active' } = req.body;

    if (!['free', 'pro', 'agency'].includes(planName)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const existing = await db.query(
      `SELECT id FROM subscriptions WHERE agency_id = $1 LIMIT 1`,
      [agencyId]
    );

    let result;

    if (existing.rows.length) {
      result = await db.query(
        `UPDATE subscriptions
         SET plan_name = $1,
             status = $2,
             updated_at = NOW()
         WHERE agency_id = $3
         RETURNING *`,
        [planName, status, agencyId]
      );
    } else {
      result = await db.query(
        `INSERT INTO subscriptions (agency_id, plan_name, status)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [agencyId, planName, status]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Super admin plan update error:', error);
    res.status(500).json({ error: 'Failed to update agency plan' });
  }
});

router.put('/agencies/:agencyId/status', async (req, res) => {
  try {
    const { agencyId } = req.params;
    const { isActive } = req.body;

    const result = await db.query(
      `UPDATE agencies
       SET is_active = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [isActive, agencyId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Agency not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Agency status update error:', error);
    res.status(500).json({ error: 'Failed to update agency status' });
  }
});

module.exports = router;