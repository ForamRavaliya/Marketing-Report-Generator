const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

router.use(authenticate);
router.use(requireSuperAdmin);

router.get('/overview', async (req, res) => {
  try {
    const [
      agenciesResult,
      clientsResult,
      reportsResult,
      usersResult,
      subscriptionsResult,
      recentAgenciesResult,
      planStatsResult,
    ] = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS total FROM agencies`),

      db.query(`SELECT COUNT(*)::int AS total FROM clients`),

      db.query(`SELECT COUNT(*)::int AS total FROM generated_reports`),

      db.query(`SELECT COUNT(*)::int AS total FROM users`),

      db.query(`
        SELECT COUNT(*)::int AS active
        FROM subscriptions
        WHERE status = 'active'
      `),

      db.query(`
        SELECT
          a.id,
          a.name,
          a.created_at,
          COUNT(c.id)::int AS clients_count,
          COUNT(u.id)::int AS users_count
        FROM agencies a
        LEFT JOIN clients c ON c.agency_id = a.id
        LEFT JOIN users u ON u.agency_id = a.id
        GROUP BY a.id
        ORDER BY a.created_at DESC
        LIMIT 8
      `),

      db.query(`
        SELECT
          COALESCE(plan_name, 'free') AS plan_name,
          COUNT(*)::int AS total
        FROM subscriptions
        GROUP BY plan_name
        ORDER BY total DESC
      `),
    ]);

    res.json({
      totals: {
        agencies: agenciesResult.rows[0].total,
        clients: clientsResult.rows[0].total,
        reports: reportsResult.rows[0].total,
        users: usersResult.rows[0].total,
        activeSubscriptions: subscriptionsResult.rows[0].active,
      },
      recentAgencies: recentAgenciesResult.rows,
      planStats: planStatsResult.rows,
    });
  } catch (error) {
    console.error('Super admin overview error:', error);
    res.status(500).json({ error: 'Failed to load super admin overview' });
  }
});

module.exports = router;