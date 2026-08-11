// Canonical plan pricing (INR). This is the single source of truth for
// checkout (routes/payments.js's Razorpay create-order) and for any
// admin-facing revenue estimate derived from subscriptions.plan_name
// (routes/superAdmin.js). Do not hardcode these numbers anywhere else.
const PLAN_PRICING = {
  free: { monthly: 0, yearly: 0 },
  pro: { monthly: 999, yearly: 9990 },
  agency: { monthly: 2500, yearly: 25000 },
};

module.exports = { PLAN_PRICING };
