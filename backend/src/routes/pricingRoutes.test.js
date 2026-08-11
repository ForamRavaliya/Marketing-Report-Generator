const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Static regression guards for the dynamic-pricing route wiring. These
// can't spin up a live server/DB in this test harness (see
// authTheme.test.js for the same constraint/approach), so they assert on
// source shape instead: the exact things that would make pricing unsafe if
// someone "simplified" the route later.

const superAdminSrc = fs.readFileSync(
  path.join(__dirname, 'superAdmin.js'),
  'utf8'
);

// Non-super-admin rejection: the whole superAdmin router is gated by
// requireSuperAdmin before any route (including /pricing) is declared.
const requireSuperAdminIdx = superAdminSrc.indexOf('requireSuperAdmin');
const pricingRouteIdx = superAdminSrc.indexOf("router.put('/pricing");
assert.ok(requireSuperAdminIdx !== -1, 'requireSuperAdmin must be applied in superAdmin.js');
assert.ok(pricingRouteIdx !== -1, "PUT /pricing/:planKey route must exist in superAdmin.js");
assert.ok(
  superAdminSrc.indexOf('router.use(requireSuperAdmin)') < pricingRouteIdx,
  'PUT /pricing/:planKey must be declared after router.use(requireSuperAdmin) so non-super-admins are rejected before reaching it'
);

// Reject invalid plan keys / malformed amounts server-side, not just in the UI.
assert.ok(
  /updatePlanPrice/.test(superAdminSrc),
  'PUT /pricing/:planKey must go through updatePlanPrice(), which validates plan_key and both prices'
);

const paymentsSrc = fs.readFileSync(
  path.join(__dirname, 'payments.js'),
  'utf8'
);

// Checkout must never trust a client-provided amount: create-order must
// resolve the amount from the server-side plan pricing resolver, and the
// request body must not be destructured for anything called "amount".
assert.ok(
  /getPlanPricingMap/.test(paymentsSrc),
  'create-order must resolve amount via getPlanPricingMap(), not a hardcoded or client-supplied value'
);
assert.ok(
  !/const\s*\{\s*[^}]*\bamount\b[^}]*\}\s*=\s*req\.body/.test(paymentsSrc),
  'create-order must never destructure a client-supplied "amount" out of req.body'
);

console.log('pricing route wiring regression tests passed (super-admin gating, no client-trusted amount)');
