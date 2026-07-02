const assert = require('assert');
const {
  calculateDerivedMetrics,
  sanitizeImportedMetrics,
  buildMonthlySummary,
  calculatePercentChange,
} = require('./metrics');

const approx = (actual, expected, tolerance = 0.0001) => {
  assert.ok(
    Math.abs(Number(actual) - Number(expected)) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
};

(() => {
  const meta = sanitizeImportedMetrics({
    spend: 2319619.7,
    impressions: 1500000,
    clicks: 1000000,
    conversions: 6152,
    revenue: 8197255.46,
  });

  approx(meta.roas, 8197255.46 / 2319619.7);
  approx(meta.cpc, 2319619.7 / 1000000);
  approx(meta.cpa, 2319619.7 / 6152);
  approx(meta.ctr, (1000000 / 1500000) * 100);
})();

(() => {
  const googleAds = calculateDerivedMetrics({
    spend: 1200,
    impressions: 40000,
    clicks: 800,
    conversions: 40,
    revenue: 6000,
  });

  approx(googleAds.ctr, 2);
  approx(googleAds.cpc, 1.5);
  approx(googleAds.cpa, 30);
  approx(googleAds.roas, 5);
})();

(() => {
  const aggregateOnly = sanitizeImportedMetrics({
    spend: 500,
    impressions: 10000,
    clicks: 300,
    conversions: 25,
  });

  approx(aggregateOnly.cpl, 20);
  approx(aggregateOnly.roas, 0);
})();

(() => {
  const campaignOnly = sanitizeImportedMetrics({
    spend: 1000,
    clicks: 100,
    impressions: 10000,
    conversions: 10,
  });

  approx(campaignOnly.cpa, 100);
})();

(() => {
  const aggregatePlusCampaign = sanitizeImportedMetrics({
    spend: 1000,
    clicks: 100,
    impressions: 10000,
    conversions: 10,
    revenue: 0,
  });

  approx(aggregatePlusCampaign.spend, 1000);
  approx(aggregatePlusCampaign.conversions, 10);
})();

(() => {
  const aggregateOnly = buildMonthlySummary([
    { metrics: { spend: 500, clicks: 50, impressions: 5000, conversions: 5 } },
  ]);

  approx(aggregateOnly.spend, 500);
  approx(aggregateOnly.cpc, 10);
})();

(() => {
  const campaignOnly = buildMonthlySummary([
    { metrics: { spend: 300, clicks: 30, impressions: 3000, conversions: 3 } },
    { metrics: { spend: 700, clicks: 70, impressions: 7000, conversions: 7 } },
  ]);

  approx(campaignOnly.spend, 1000);
  approx(campaignOnly.clicks, 100);
  approx(campaignOnly.cpa, 100);
})();

(() => {
  const mixedPlatformUpload = buildMonthlySummary([
    { metrics: { spend: 600, clicks: 60, impressions: 6000, conversions: 6, revenue: 1200 } },
    { metrics: { spend: 400, clicks: 40, impressions: 4000, conversions: 4, revenue: 800 } },
  ]);

  approx(mixedPlatformUpload.spend, 1000);
  approx(mixedPlatformUpload.roas, 2);
})();

(() => {
  const missingRevenue = sanitizeImportedMetrics({
    spend: 1000,
    clicks: 100,
    impressions: 10000,
    conversions: 10,
  });

  approx(missingRevenue.roas, 0);
})();

(() => {
  const missingConversions = sanitizeImportedMetrics({
    spend: 1000,
    clicks: 100,
    impressions: 10000,
    revenue: 5000,
  });

  approx(missingConversions.cpa, 0);
  approx(missingConversions.roas, 5);
})();

(() => {
  const duplicateUpload = sanitizeImportedMetrics({
    spend: -100,
    impressions: 10,
    clicks: 20,
    conversions: -3,
    revenue: -500,
  });

  approx(duplicateUpload.spend, 0);
  approx(duplicateUpload.impressions, 20);
  approx(duplicateUpload.clicks, 20);
  approx(duplicateUpload.conversions, 0);
  approx(duplicateUpload.revenue, 0);
})();

(() => {
  const noPrevious = calculatePercentChange(100, 0);
  assert.strictEqual(noPrevious.value, null);
  assert.strictEqual(noPrevious.label, 'No previous data');
  assert.strictEqual(noPrevious.hasPreviousData, false);

  const changed = calculatePercentChange(150, 100);
  approx(changed.value, 50);
  assert.strictEqual(changed.hasPreviousData, true);
})();

(() => {
  const march = buildMonthlySummary([{ metrics: { spend: 100, conversions: 10 } }]);
  const april = buildMonthlySummary([{ metrics: { spend: 150, conversions: 15 } }]);
  const change = calculatePercentChange(april.spend, march.spend);

  approx(change.value, 50);
})();

console.log('metrics validation tests passed');
