const express = require('express');
const router = express.Router();
const db = require('../db');
const { getPlanPricingMap } = require('../services/planPricingService');

// Unauthenticated, read-only. Lets the public marketing site and the
// authenticated Subscription page render the same live plan prices
// (subscription_plans, falling back to static PLAN_PRICING defaults) that
// payments.js resolves checkout amounts from -- this is the single
// consumer-facing source for plan prices outside of payments.js itself.
router.get('/pricing', async (req, res) => {
  try {
    const plans = await getPlanPricingMap(db);
    res.json({ plans });
  } catch (error) {
    console.error('Public pricing error:', error);
    res.status(500).json({ error: 'Failed to load pricing' });
  }
});

module.exports = router;
