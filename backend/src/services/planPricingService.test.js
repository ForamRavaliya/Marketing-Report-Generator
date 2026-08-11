const assert = require('assert');
const {
  getPlanPricingMap,
  getPlanPrice,
  updatePlanPrice,
  InvalidPlanPricingError,
} = require('./planPricingService');
const { PLAN_PRICING } = require('../config/pricing');

// In-memory stand-in for subscription_plans -- no real DB/network involved,
// mirrors the exact SELECT/UPDATE shapes planPricingService.js issues.
const makeFakeDb = (initialRows) => {
  let rows = initialRows.map((r) => ({ ...r }));

  return {
    async query(text, params = []) {
      if (/FROM subscription_plans/.test(text) && /SELECT/.test(text)) {
        return { rows: rows.filter((r) => r.is_active) };
      }

      if (/UPDATE subscription_plans/.test(text)) {
        const [monthly_price, yearly_price, updated_by, plan_key] = params;
        const row = rows.find((r) => r.plan_key === plan_key);
        if (!row) return { rows: [] };
        row.monthly_price = monthly_price;
        row.yearly_price = yearly_price;
        row.updated_by = updated_by;
        row.updated_at = new Date().toISOString();
        return { rows: [{ ...row }] };
      }

      throw new Error(`Unexpected query in fake db: ${text}`);
    },
  };
};

const seedRows = () => [
  { plan_key: 'free', display_name: 'Free', monthly_price: 0, yearly_price: 0, currency: 'INR', is_active: true, sort_order: 0 },
  { plan_key: 'pro', display_name: 'Pro', monthly_price: 999, yearly_price: 9990, currency: 'INR', is_active: true, sort_order: 1 },
  { plan_key: 'agency', display_name: 'Agency', monthly_price: 2500, yearly_price: 25000, currency: 'INR', is_active: true, sort_order: 2 },
];

(async () => {
  // 1. Initial Pro monthly = 999 -- create-order resolver returns 999.
  {
    const db = makeFakeDb(seedRows());
    const price = await getPlanPrice(db, 'pro', 'monthly');
    assert.strictEqual(price, 999, 'initial Pro monthly price must resolve to 999');
  }

  // 2. Super Admin changes stored Pro monthly to 700 -- the *next* order
  //    resolver call must return 700, without any code change/redeploy.
  {
    const db = makeFakeDb(seedRows());
    await updatePlanPrice(db, { planKey: 'pro', monthlyPrice: 700, yearlyPrice: 9990, updatedBy: 42 });
    const price = await getPlanPrice(db, 'pro', 'monthly');
    assert.strictEqual(price, 700, 'Pro monthly price must resolve to 700 after Super Admin update');
  }

  // 3. Order-time snapshot safety: an order created while Pro monthly was
  //    999 must keep expected_amount = 999 in its own row even after the
  //    live plan price changes to 700. payment_orders.amount is written
  //    once at create-order time and never re-derived from current pricing
  //    -- this test simulates that by keeping the "order" as a plain object
  //    independent of the mutable plan config, exactly like the real
  //    payment_orders row is.
  {
    const db = makeFakeDb(seedRows());
    const priceAtOrderTime = await getPlanPrice(db, 'pro', 'monthly');
    const order = { plan_name: 'pro', billing_cycle: 'monthly', amount: priceAtOrderTime };
    assert.strictEqual(order.amount, 999);

    await updatePlanPrice(db, { planKey: 'pro', monthlyPrice: 700, yearlyPrice: 9990, updatedBy: 42 });
    const priceNow = await getPlanPrice(db, 'pro', 'monthly');

    assert.strictEqual(priceNow, 700, 'live price must have moved to 700');
    assert.strictEqual(order.amount, 999, 'a previously created order must keep its original 999 expected_amount');
  }

  // paymentReconciliationService must never re-derive an order's expected
  // amount from current plan pricing -- verification compares the Razorpay
  // payment against order.amount, the value stored at create-order time.
  {
    const fs = require('fs');
    const path = require('path');
    const reconciliationSrc = fs.readFileSync(
      path.join(__dirname, 'paymentReconciliationService.js'),
      'utf8'
    );
    assert.ok(
      !/planPricingService/.test(reconciliationSrc),
      'paymentReconciliationService.js must not import planPricingService -- verification must only trust the stored payment_orders.amount snapshot, never live plan pricing'
    );
  }

  // 4. Negative price rejected.
  {
    const db = makeFakeDb(seedRows());
    await assert.rejects(
      () => updatePlanPrice(db, { planKey: 'pro', monthlyPrice: -1, yearlyPrice: 9990, updatedBy: 1 }),
      InvalidPlanPricingError
    );
  }

  // 5. Malformed amount rejected (non-integer / NaN).
  {
    const db = makeFakeDb(seedRows());
    await assert.rejects(
      () => updatePlanPrice(db, { planKey: 'pro', monthlyPrice: Number('not-a-number'), yearlyPrice: 9990, updatedBy: 1 }),
      InvalidPlanPricingError
    );
    await assert.rejects(
      () => updatePlanPrice(db, { planKey: 'pro', monthlyPrice: 99.5, yearlyPrice: 9990, updatedBy: 1 }),
      InvalidPlanPricingError
    );
  }

  // 6. Unknown plan key rejected -- arbitrary frontend-supplied plan
  //    identifiers must never reach the DB.
  {
    const db = makeFakeDb(seedRows());
    await assert.rejects(
      () => updatePlanPrice(db, { planKey: 'enterprise', monthlyPrice: 1000, yearlyPrice: 10000, updatedBy: 1 }),
      InvalidPlanPricingError
    );
    const price = await getPlanPrice(db, 'enterprise', 'monthly');
    assert.strictEqual(price, null, 'getPlanPrice must return null for an unknown plan key');
  }

  // 7. Yearly pricing resolves independently of monthly.
  {
    const db = makeFakeDb(seedRows());
    await updatePlanPrice(db, { planKey: 'agency', monthlyPrice: 2500, yearlyPrice: 22000, updatedBy: 1 });
    const monthly = await getPlanPrice(db, 'agency', 'monthly');
    const yearly = await getPlanPrice(db, 'agency', 'yearly');
    assert.strictEqual(monthly, 2500);
    assert.strictEqual(yearly, 22000);
  }

  // 8. Public pricing response shape -- map keyed by plan_key with
  //    { monthly, yearly, currency }, matching what usePublicPricing.js
  //    (frontend) and payments.js create-order both expect.
  {
    const db = makeFakeDb(seedRows());
    const map = await getPlanPricingMap(db);
    for (const key of ['free', 'pro', 'agency']) {
      assert.ok(map[key], `plan map must include ${key}`);
      assert.strictEqual(typeof map[key].monthly, 'number');
      assert.strictEqual(typeof map[key].yearly, 'number');
      assert.strictEqual(map[key].currency, 'INR');
    }
  }

  // 9. Fallback safety: if subscription_plans is unavailable (table
  //    missing, DB error), pricing must fall back to the trusted static
  //    PLAN_PRICING defaults -- never throw, never trust a caller-supplied
  //    amount, never silently return an empty/undefined price.
  {
    const brokenDb = { query: async () => { throw new Error('relation "subscription_plans" does not exist'); } };
    const map = await getPlanPricingMap(brokenDb);
    assert.strictEqual(map.pro.monthly, PLAN_PRICING.pro.monthly);
    assert.strictEqual(map.pro.yearly, PLAN_PRICING.pro.yearly);
    assert.strictEqual(map.agency.monthly, PLAN_PRICING.agency.monthly);
    assert.strictEqual(map.free.monthly, 0);
  }

  console.log('planPricingService dynamic-pricing regression tests passed (999 -> 700 scenario, order-time snapshot, validation, fallback)');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
