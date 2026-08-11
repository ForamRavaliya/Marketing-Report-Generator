const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Mirrors the exact hasReach formula used in routes/reports.js's safeSummary
// construction (hand-mirrored, not imported, since it's an inline object
// literal there -- same pattern already used for hasSpend/hasClicks/
// hasRevenue/hasImpressions/hasConversions in that same object).
const computeHasReach = (summary) => Boolean(summary?.has_reach_field) || Number(summary?.reach ?? 0) > 0;

// Case: field never mapped in the source data, value is 0 -> unavailable,
// must stay hidden (not shown as a misleading "0").
assert.strictEqual(computeHasReach({ has_reach_field: false, reach: 0 }), false);

// Case: field genuinely mapped/available, and the true value for the period
// is 0 -> must remain available (displays "0", not hidden as N/A).
assert.strictEqual(computeHasReach({ has_reach_field: true, reach: 0 }), true);

// Case: available with a real positive value.
assert.strictEqual(computeHasReach({ has_reach_field: true, reach: 4521 }), true);

// Case: flag missing/undefined but a positive value still present (defensive
// fallback -- matches has_spend_field/has_clicks_field/etc. siblings).
assert.strictEqual(computeHasReach({ reach: 10 }), true);

// Source guard: confirm routes/reports.js actually contains the corrected
// pattern, so a future edit that drops the has_reach_field check fails this
// test even though the formula above is hand-mirrored, not imported.
const reportsSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'reports.js'), 'utf8');
assert.ok(
  /hasReach:\s*Boolean\(summary\?\.has_reach_field\)\s*\|\|\s*Number\(summary\?\.reach/.test(reportsSrc),
  'reports.js safeSummary.hasReach must consult has_reach_field, matching hasSpend/hasClicks/hasRevenue/hasImpressions/hasConversions'
);

console.log('Reach availability regression tests passed');
