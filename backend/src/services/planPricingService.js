const { PLAN_PRICING } = require('../config/pricing');

const PLAN_KEYS = ['free', 'pro', 'agency'];
const PLAN_DISPLAY_NAMES = { free: 'Free', pro: 'Pro', agency: 'Agency' };

const isValidPlanKey = (planKey) => PLAN_KEYS.includes(planKey);

const isValidPrice = (value) =>
  Number.isInteger(value) && value >= 0;

// Static PLAN_PRICING reshaped into the same row shape subscription_plans
// rows have, so callers never need to branch on where the data came from.
const fallbackRows = () =>
  PLAN_KEYS.map((planKey, i) => ({
    plan_key: planKey,
    display_name: PLAN_DISPLAY_NAMES[planKey],
    monthly_price: PLAN_PRICING[planKey].monthly,
    yearly_price: PLAN_PRICING[planKey].yearly,
    currency: 'INR',
    is_active: true,
    sort_order: i,
  }));

// Reads live plan pricing from subscription_plans. Falls back to the
// hardcoded PLAN_PRICING defaults -- never to a client-supplied value --
// whenever the table is missing, empty, or the query fails for any reason
// (fresh environment before the migration has run, transient DB error,
// etc.), so checkout and the public pricing page keep working with a
// trusted price instead of breaking or trusting the caller.
const getAllPlans = async (db) => {
  try {
    const result = await db.query(
      `SELECT plan_key, display_name, monthly_price, yearly_price, currency, is_active, sort_order
       FROM subscription_plans
       WHERE is_active = true
       ORDER BY sort_order ASC`
    );

    if (!result.rows.length) {
      return fallbackRows();
    }

    return result.rows;
  } catch (error) {
    console.error('planPricingService.getAllPlans: falling back to static PLAN_PRICING:', error.message);
    return fallbackRows();
  }
};

// { free: { monthly, yearly, currency }, pro: {...}, agency: {...} } --
// drop-in replacement shape for the old static PLAN_PRICING import.
const getPlanPricingMap = async (db) => {
  const rows = await getAllPlans(db);
  const map = {};
  for (const row of rows) {
    map[row.plan_key] = {
      monthly: row.monthly_price,
      yearly: row.yearly_price,
      currency: row.currency || 'INR',
    };
  }
  // Any plan missing from the DB result (e.g. a row was deactivated) still
  // resolves to its trusted static default rather than being silently
  // absent -- checkout must never end up with an undefined price.
  for (const planKey of PLAN_KEYS) {
    if (!map[planKey]) {
      map[planKey] = { ...PLAN_PRICING[planKey], currency: 'INR' };
    }
  }
  return map;
};

// Resolves a single price server-side. Returns null for an invalid plan/
// cycle so the caller can 400 -- this is the only function checkout should
// call to turn (planName, billingCycle) into a trusted amount.
const getPlanPrice = async (db, planKey, billingCycle) => {
  if (!isValidPlanKey(planKey)) return null;
  const cycle = billingCycle === 'yearly' ? 'yearly' : 'monthly';
  const map = await getPlanPricingMap(db);
  return map[planKey][cycle];
};

// Super Admin write path. Validates plan_key and both prices before
// touching the DB; throws a typed error the route layer maps to a 400
// rather than ever silently accepting a bad value.
class InvalidPlanPricingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidPlanPricingError';
  }
}

const updatePlanPrice = async (db, { planKey, monthlyPrice, yearlyPrice, updatedBy }) => {
  if (!isValidPlanKey(planKey)) {
    throw new InvalidPlanPricingError(`Unknown plan key: ${planKey}`);
  }
  if (!isValidPrice(monthlyPrice)) {
    throw new InvalidPlanPricingError('monthlyPrice must be a non-negative integer');
  }
  if (!isValidPrice(yearlyPrice)) {
    throw new InvalidPlanPricingError('yearlyPrice must be a non-negative integer');
  }

  const result = await db.query(
    `UPDATE subscription_plans
     SET monthly_price = $1,
         yearly_price = $2,
         updated_at = NOW(),
         updated_by = $3
     WHERE plan_key = $4
     RETURNING plan_key, display_name, monthly_price, yearly_price, currency, is_active, sort_order, updated_at, updated_by`,
    [monthlyPrice, yearlyPrice, updatedBy || null, planKey]
  );

  if (!result.rows.length) {
    // subscription_plans exists but has no row for this plan_key yet
    // (migration not run, or row missing) -- fail loudly instead of
    // pretending the update succeeded.
    throw new InvalidPlanPricingError(
      `No subscription_plans row for '${planKey}' -- has the migration been run?`
    );
  }

  return result.rows[0];
};

module.exports = {
  PLAN_KEYS,
  isValidPlanKey,
  isValidPrice,
  getAllPlans,
  getPlanPricingMap,
  getPlanPrice,
  updatePlanPrice,
  InvalidPlanPricingError,
};
