const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Mirrors the exact reportType formula in routes/reports.js and the isSales
// formula in services/aiInsightsService.js's reportLabels(), both of which
// now trust the canonical summary.report_type (computed once in
// utils/metrics.js's semanticReportTypeSql/normalizeReportTypeSql) instead
// of re-deriving Sales from revenue+conversions independently.
const computeReportType = (summary) => {
  const rawReportType = String(summary?.report_type || '').toLowerCase();
  return rawReportType === 'sales_campaign' || rawReportType === 'sales_data'
    ? 'sales_campaign'
    : 'lead_generation';
};

// Canonical categories must retain their previously-correct classification.
assert.strictEqual(computeReportType({ report_type: 'lead_generation', revenue: 0, conversions: 138 }), 'lead_generation');
assert.strictEqual(computeReportType({ report_type: 'sales_campaign', revenue: 8197255.46, conversions: 6152 }), 'sales_campaign');
assert.strictEqual(computeReportType({ report_type: 'sales_data', revenue: 50000, conversions: 40 }), 'sales_campaign');
assert.strictEqual(computeReportType({ report_type: 'app', revenue: 0, conversions: 10 }), 'lead_generation');
assert.strictEqual(computeReportType({ report_type: 'needs_review', revenue: 0, conversions: 0 }), 'lead_generation');

// The bug: a lead-generation report with incidental revenue+conversions
// tracked must NOT flip to Sales terminology just because both are > 0 --
// summary.report_type already encodes the canonical decision.
assert.strictEqual(computeReportType({ report_type: 'lead_generation', revenue: 500, conversions: 5 }), 'lead_generation');

// Source guard: confirm the duplicated hasSalesRevenue override is actually
// gone from both files, not just from this hand-mirrored formula.
const reportsSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'reports.js'), 'utf8');
assert.ok(!/hasSalesRevenue/.test(reportsSrc), 'routes/reports.js must not re-derive Sales from revenue+conversions (hasSalesRevenue removed)');

const aiInsightsSrc = fs.readFileSync(path.join(__dirname, '..', 'services', 'aiInsightsService.js'), 'utf8');
assert.ok(
  !/isSales[\s\S]{0,200}revenue[\s\S]{0,50}conversions/.test(aiInsightsSrc.split('reportLabels')[1]?.split('};')[0] || ''),
  'aiInsightsService.js reportLabels() must not re-derive Sales from revenue+conversions'
);

console.log('Report-type override regression tests passed');
