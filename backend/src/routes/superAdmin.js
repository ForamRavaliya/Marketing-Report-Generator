const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const {
  getAllPlans,
  getPlanPricingMap,
  updatePlanPrice,
  InvalidPlanPricingError,
} = require('../services/planPricingService');

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
      planPricing,
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
        SELECT plan_name
        FROM subscriptions
        WHERE status = 'active'
      `),

      db.query(`
        SELECT
          a.id,
          a.name,
          a.logo_url,
          a.created_at,
          a.is_active,
          a.contact_email,
          a.phone,
          a.website,
          a.address,
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
      getPlanPricingMap(db),
    ]);

    // Current Estimated MRR: active subscriptions valued at today's plan
    // prices -- moves the instant Super Admin edits a price. This is
    // distinct from recentPayments below, which are actual historical
    // payment rows and must never be recomputed from current pricing.
    const monthlyPlanValue = (planName) => planPricing[planName]?.monthly ?? 0;

    const monthlyRevenue = revenueResult.rows.reduce(
      (sum, row) => sum + monthlyPlanValue(row.plan_name),
      0
    );

    const agencies = agenciesResult.rows.map((agency) => ({
      ...agency,
      monthly_value: monthlyPlanValue(agency.plan_name),
    }));

    res.json({
      totals: {
        agencies: totalsResult.rows[0].agencies,
        users: totalsResult.rows[0].users,
        clients: totalsResult.rows[0].clients,
        reports: totalsResult.rows[0].reports,
        activeSubscriptions: totalsResult.rows[0].active_subscriptions,
        // Current Estimated MRR (live plan prices x active subscriptions),
        // not a historical total -- see recentPayments for actual payments.
        monthlyRevenue,
      },
      agencies,
      planStats: planStatsResult.rows,
      // Historical, actual payment rows -- amounts are exactly what was
      // charged at the time, independent of any later price change.
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

// Dynamic plan pricing management. Super-admin only (enforced by the
// router-level requireSuperAdmin above). Reads/writes subscription_plans
// directly -- getAllPlans() falls back to static PLAN_PRICING defaults if
// the migration hasn't been run yet, so this list always renders something
// sane, but an update attempt against a missing table fails loudly instead
// of pretending to save.
router.get('/pricing', async (req, res) => {
  try {
    const plans = await getAllPlans(db);
    res.json({ plans });
  } catch (error) {
    console.error('Super admin pricing list error:', error);
    res.status(500).json({ error: 'Failed to load plan pricing' });
  }
});

router.put('/pricing/:planKey', async (req, res) => {
  try {
    const { planKey } = req.params;
    const { monthlyPrice, yearlyPrice } = req.body;

    const updated = await updatePlanPrice(db, {
      planKey,
      monthlyPrice: Number(monthlyPrice),
      yearlyPrice: Number(yearlyPrice),
      updatedBy: req.user.id,
    });

    res.json(updated);
  } catch (error) {
    if (error instanceof InvalidPlanPricingError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Super admin pricing update error:', error);
    res.status(500).json({ error: 'Failed to update plan pricing' });
  }
});

module.exports = router;
