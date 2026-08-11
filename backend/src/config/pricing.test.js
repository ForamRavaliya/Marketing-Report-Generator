const assert = require('assert');
const { PLAN_PRICING } = require('./pricing');

// Canonical checkout values (routes/payments.js create-order) must be
// unchanged by this refactor.
assert.strictEqual(PLAN_PRICING.free.monthly, 0);
assert.strictEqual(PLAN_PRICING.free.yearly, 0);
assert.strictEqual(PLAN_PRICING.pro.monthly, 999);
assert.strictEqual(PLAN_PRICING.pro.yearly, 9990);
assert.strictEqual(PLAN_PRICING.agency.monthly, 2500);
assert.strictEqual(PLAN_PRICING.agency.yearly, 25000);

console.log('Canonical pricing regression tests passed');
