const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Mirrors frontend/src/pages/ClientDetail.jsx's normalizeFrontendReportType +
// normalizedReportType logic (hand-mirrored, not imported -- it's JSX, not a
// standalone module). Verifies the fix that removed the unconditional
// `revenue > 0 && conversions > 0` override, which used to run BEFORE
// checking the already-resolved canonical value.
const normalizeFrontendReportType = (type, revenueForAdsFallback) => {
  if (['sales_campaign', 'lead_generation', 'sales_data', 'traffic', 'engagement', 'app', 'acquisition'].includes(type)) {
    return type;
  }
  if (type === 'ads') {
    return revenueForAdsFallback > 0 ? 'sales_campaign' : 'lead_generation';
  }
  return 'needs_review';
};

const computeNormalizedReportType = (reportType, revenue) => {
  const normalized = normalizeFrontendReportType(reportType, revenue);
  if (normalized !== 'needs_review') return normalized;
  return 'lead_generation';
};

// Canonical categories must retain their previously-correct classification.
assert.strictEqual(computeNormalizedReportType('lead_generation', 0), 'lead_generation');
assert.strictEqual(computeNormalizedReportType('sales_campaign', 8197255), 'sales_campaign');
assert.strictEqual(computeNormalizedReportType('sales_data', 50000), 'sales_data');
assert.strictEqual(computeNormalizedReportType('app', 0), 'app');
assert.strictEqual(computeNormalizedReportType('needs_review', 0), 'lead_generation');

// ads/fallback behavior must remain unchanged.
assert.strictEqual(computeNormalizedReportType('ads', 100), 'sales_campaign');
assert.strictEqual(computeNormalizedReportType('ads', 0), 'lead_generation');

// The bug: incidental revenue in a lead-generation report must not convert
// it to sales_campaign, and a genuine sales_data report must not be
// collapsed into the generic sales_campaign bucket.
assert.strictEqual(computeNormalizedReportType('lead_generation', 500), 'lead_generation');
assert.strictEqual(computeNormalizedReportType('sales_data', 500), 'sales_data');

// Source guard: confirm the unconditional revenue+conversions override is
// actually gone from ClientDetail.jsx.
const clientDetailSrc = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'frontend', 'src', 'pages', 'ClientDetail.jsx'),
  'utf8'
);
assert.ok(
  !/revenue > 0 && conversions > 0/.test(clientDetailSrc),
  'ClientDetail.jsx must not re-derive Sales from revenue+conversions ahead of the canonical report_type'
);

console.log('ClientDetail report-type regression tests passed');
