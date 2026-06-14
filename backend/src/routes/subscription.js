const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Get current subscription
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, agency_id, plan_name, status, started_at, expires_at, next_plan_name, downgrade_scheduled
       FROM subscriptions
       WHERE agency_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user.agency_id]
    );

    if (!result.rows[0]) {
      const created = await db.query(
        `INSERT INTO subscriptions (agency_id, plan_name, status)
         VALUES ($1, 'free', 'active')
         RETURNING id, agency_id, plan_name, status, started_at, expires_at, next_plan_name, downgrade_scheduled`,
        [req.user.agency_id]
      );

      return res.json(created.rows[0]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// Update subscription plan
router.put('/plan', async (req, res) => {
  try {
    const { planName } = req.body;

    if (!['free', 'pro', 'agency'].includes(planName)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }
    if (['pro', 'agency'].includes(planName)) {
      return res.status(403).json({
        error: 'Paid plans require payment verification',
      });
    }

    const currentResult = await db.query(
      `SELECT *
       FROM subscriptions
       WHERE agency_id = $1
       LIMIT 1`,
      [req.user.agency_id]
    );

    const currentSubscription = currentResult.rows[0];

    if (
      planName === 'free' &&
      currentSubscription &&
      ['pro', 'agency'].includes(currentSubscription.plan_name) &&
      currentSubscription.status === 'active' &&
      currentSubscription.expires_at &&
      new Date(currentSubscription.expires_at) > new Date()
    ) {
      const scheduled = await db.query(
        `UPDATE subscriptions
         SET next_plan_name = 'free',
             downgrade_scheduled = TRUE,
             updated_at = CURRENT_TIMESTAMP
         WHERE agency_id = $1
         RETURNING id, agency_id, plan_name, status, started_at, expires_at, next_plan_name, downgrade_scheduled`,
        [req.user.agency_id]
      );

      return res.json(scheduled.rows[0]);
    }

    const result = await db.query(
      `UPDATE subscriptions
       SET plan_name = $1,
           status = 'active',
           next_plan_name = NULL,
           downgrade_scheduled = FALSE,
           updated_at = CURRENT_TIMESTAMP
       WHERE agency_id = $2
       RETURNING id, agency_id, plan_name, status, started_at, expires_at, next_plan_name, downgrade_scheduled`,
      [planName, req.user.agency_id]
    );

    if (!result.rows[0]) {
      const created = await db.query(
        `INSERT INTO subscriptions (agency_id, plan_name, status)
         VALUES ($1, $2, 'active')
        RETURNING id, agency_id, plan_name, status, started_at, expires_at, next_plan_name, downgrade_scheduled`,
        [req.user.agency_id, planName]
      );

      return res.json(created.rows[0]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

router.put('/cancel-downgrade', async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE subscriptions
       SET next_plan_name = NULL,
           downgrade_scheduled = FALSE,
           updated_at = CURRENT_TIMESTAMP
       WHERE agency_id = $1
       AND downgrade_scheduled = TRUE
       RETURNING id, agency_id, plan_name, status, started_at, expires_at, next_plan_name, downgrade_scheduled`,
      [req.user.agency_id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({
        error: 'No scheduled downgrade found',
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Cancel downgrade error:', error);
    res.status(500).json({ error: 'Failed to cancel downgrade' });
  }
});
module.exports = router;