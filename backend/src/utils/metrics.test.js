const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  calculateDerivedMetrics,
  getAllResults,
  getCanonicalReportType,
  getPrimaryOutcome,
  getQualifiedLeads,
  interpretResultSemantics,
  isMetricAvailable,
  sanitizeImportedMetrics,
  buildMonthlySummary,
  calculatePercentChange,
} = require('./metrics');
const {
  detectResultType,
  detectRowLevel,
  getExplicitResultValue,
  isApprovedPrimaryResultType,
  mergeResultBreakdowns,
  primaryResultValue,
  preferredAggregateSourceRows,
  selectCanonicalCampaignRows,
} = require('./importGranularity');
const { validateLocalPdf } = require('./cloudinary');

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

(() => {
  const clicksMissing = {
    hasSpend: true,
    hasImpressions: true,
    hasClicks: false,
    hasConversions: true,
    hasRevenue: false,
  };
  assert.strictEqual(isMetricAvailable('clicks', clicksMissing), false);
  assert.strictEqual(isMetricAvailable('ctr', clicksMissing), false);
  assert.strictEqual(isMetricAvailable('cpc', clicksMissing), false);
  assert.strictEqual(isMetricAvailable('revenue', clicksMissing), false);
  assert.strictEqual(isMetricAvailable('roas', clicksMissing), false);

  const clicksExplicitZero = {
    hasSpend: true,
    hasImpressions: true,
    hasClicks: true,
    hasConversions: true,
    hasRevenue: false,
  };
  assert.strictEqual(isMetricAvailable('clicks', clicksExplicitZero), true);
  assert.strictEqual(isMetricAvailable('ctr', clicksExplicitZero), true);
  assert.strictEqual(isMetricAvailable('cpc', clicksExplicitZero), true);

  const revenueExplicitZero = {
    hasSpend: true,
    hasImpressions: true,
    hasClicks: false,
    hasConversions: true,
    hasRevenue: true,
  };
  assert.strictEqual(isMetricAvailable('revenue', revenueExplicitZero), true);
  assert.strictEqual(isMetricAvailable('roas', revenueExplicitZero), true);

  const kalravAvailability = {
    hasSpend: true,
    hasImpressions: true,
    hasClicks: false,
    hasConversions: true,
    hasRevenue: false,
  };
  const kalravVisible = ['spend', 'conversions', 'cpa', 'impressions'].filter((key) =>
    isMetricAvailable(key, kalravAvailability)
  );
  const kalravHidden = ['clicks', 'ctr', 'cpc', 'revenue', 'roas'].filter((key) =>
    !isMetricAvailable(key, kalravAvailability)
  );
  assert.deepStrictEqual(kalravVisible, ['spend', 'conversions', 'cpa', 'impressions']);
  assert.deepStrictEqual(kalravHidden, ['clicks', 'ctr', 'cpc', 'revenue', 'roas']);
})();

(() => {
  const campaignRow = {
    'Campaign name': 'New Audience',
    'Result type': 'Leads (Form)',
  };
  const adSetRow = {
    'Campaign name': 'New Audience',
    'Ad set name': 'New Audience - broad',
    'Result type': 'Leads (Form)',
  };
  const qualifiedLeadRow = {
    'Campaign name': 'Carousel',
    'Ad set name': 'Carousel child',
    'Result type': 'Qualified lead',
  };

  assert.strictEqual(detectRowLevel(campaignRow, 'New Audience'), 'campaign');
  assert.strictEqual(detectRowLevel(adSetRow, 'New Audience'), 'ad_set');
  assert.strictEqual(detectResultType(campaignRow, 'Results'), 'lead_form');
  assert.strictEqual(detectResultType(qualifiedLeadRow, 'Results'), 'qualified_lead');
  assert.strictEqual(detectResultType({ Results: 104 }, 'Results'), 'results');
  assert.strictEqual(isApprovedPrimaryResultType('Leads (Form)', 'lead_generation'), true);
  assert.strictEqual(isApprovedPrimaryResultType('Results', 'lead_generation'), false);
  assert.strictEqual(isApprovedPrimaryResultType('Qualified lead', 'lead_generation'), false);
})();

(() => {
  const rows = [
    {
      name: 'New Audience',
      rowLevel: 'campaign',
      reportMonth: new Date('2026-07-01'),
      metrics: { spend: 11661.06, impressions: 63372, conversions: 104 },
    },
    {
      name: 'New Audience',
      rowLevel: 'ad_set',
      reportMonth: new Date('2026-07-01'),
      metrics: { spend: 10446.67, impressions: 57965, conversions: 91 },
    },
    {
      name: '10% Leads',
      rowLevel: 'campaign',
      reportMonth: new Date('2026-07-01'),
      metrics: { spend: 1446.11, impressions: 9095, conversions: 13 },
    },
  ];

  const selected = selectCanonicalCampaignRows(rows);
  assert.strictEqual(selected.length, 2);
  approx(buildMonthlySummary(selected).spend, 13107.17);
  approx(buildMonthlySummary(selected).conversions, 117);
})();

(() => {
  const summaryRows = [
    {
      rowLevel: 'account',
      reportMonth: new Date('2026-07-01'),
      metrics: { spend: 16949.12, reach: 36875, impressions: 83343 },
    },
  ];
  const detailRows = [
    {
      rowLevel: 'campaign',
      reportMonth: new Date('2026-07-01'),
      metrics: { spend: 11661.06, reach: 29105, impressions: 63372 },
    },
    {
      rowLevel: 'ad_set',
      reportMonth: new Date('2026-07-01'),
      metrics: { spend: 10446.67, reach: 27832, impressions: 57965 },
    },
  ];

  assert.deepStrictEqual(
    preferredAggregateSourceRows({ summaryRows, detailRows, useCampaignRowsForMonthlyAggregate: false }),
    summaryRows
  );

  const fallback = preferredAggregateSourceRows({ summaryRows: [], detailRows, useCampaignRowsForMonthlyAggregate: false });
  assert.strictEqual(fallback.length, 1);
  assert.strictEqual(fallback[0].rowLevel, 'campaign');
})();

(() => {
  const parseNumber = (value) => Number(String(value).replace(/,/g, ''));
  const newAudience = {
    'Campaign name': 'New Audience Leads campaign',
    Results: 104,
    'Result type': 'Leads (Form)',
  };
  const tenPercent = {
    'Campaign name': '10% Leads campaign',
    Results: 13,
    'Result type': 'Leads (Form)',
  };
  const carouselLeadForm = {
    'Campaign name': 'Carousel',
    Results: 21,
    'Result type': 'Leads (Form)',
  };
  const carouselQualified = {
    'Campaign name': 'Carousel',
    Results: 1,
    'Result type': 'Qualified lead',
  };

  const newAudienceBreakdown = {
    [detectResultType(newAudience, 'Results')]: getExplicitResultValue(newAudience, parseNumber),
  };
  const tenPercentBreakdown = {
    [detectResultType(tenPercent, 'Results')]: getExplicitResultValue(tenPercent, parseNumber),
  };
  const carouselBreakdown = mergeResultBreakdowns([
    { [detectResultType(carouselLeadForm, 'Results')]: getExplicitResultValue(carouselLeadForm, parseNumber) },
    { [detectResultType(carouselQualified, 'Results')]: getExplicitResultValue(carouselQualified, parseNumber) },
  ]);

  approx(primaryResultValue(newAudienceBreakdown, 'lead_generation'), 104);
  approx(primaryResultValue(tenPercentBreakdown, 'lead_generation'), 13);
  approx(primaryResultValue(carouselBreakdown, 'lead_generation'), 21);
  approx(carouselBreakdown.qualified_lead, 1);
})();

(() => {
  const leadFormOnly = { lead_form: 104 };
  approx(primaryResultValue(leadFormOnly, 'lead_generation'), 104);

  const mixedLeadQuality = mergeResultBreakdowns([
    { lead_form: 21 },
    { qualified_lead: 1 },
  ]);
  approx(primaryResultValue(mixedLeadQuality, 'lead_generation'), 21);
  approx(mixedLeadQuality.qualified_lead, 1);

  const purchaseResult = { purchase: 6 };
  approx(primaryResultValue(purchaseResult, 'sales_campaign'), 6);

  const unknownResult = { registrations: 9 };
  approx(primaryResultValue(unknownResult, 'lead_generation'), 0);
})();

(() => {
  const aggregate = {
    report_type: 'app',
    result_type: 'lead_form,qualified_lead',
    result_value: 139,
    result_breakdown: { lead_form: 138, qualified_lead: 1 },
    conversions: 139,
    spend: 16949.12,
  };
  const aggregateSemantics = interpretResultSemantics(aggregate);
  assert.strictEqual(aggregateSemantics.reportType, 'lead_generation');
  approx(aggregateSemantics.primaryValue, 138);
  approx(aggregateSemantics.qualifiedLeads, 1);
  approx(aggregateSemantics.allResults, 139);
  approx(getPrimaryOutcome(aggregate), 138);
  approx(getQualifiedLeads(aggregate), 1);
  approx(getAllResults(aggregate), 139);

  const purchase = interpretResultSemantics({
    report_type: 'ads',
    result_breakdown: { purchase: 50 },
  });
  assert.strictEqual(purchase.reportType, 'sales_campaign');
  approx(purchase.primaryValue, 50);

  const app = interpretResultSemantics({
    report_type: 'ads',
    result_breakdown: { app_install: 200 },
  });
  assert.strictEqual(app.reportType, 'app');
  approx(app.primaryValue, 200);

  const unknown = interpretResultSemantics({
    report_type: 'app',
    result_type: 'results',
    result_value: 25,
    result_breakdown: { some_custom_event: 25 },
    conversions: 25,
  });
  assert.strictEqual(unknown.reportType, 'needs_review');
  approx(unknown.primaryValue, 0);
  approx(unknown.allResults, 25);

  const campaign = interpretResultSemantics({
    report_type: 'lead_generation',
    result_breakdown: { lead_form: 21, qualified_lead: 1 },
    result_value: 22,
    conversions: 22,
  });
  assert.strictEqual(campaign.reportType, 'lead_generation');
  approx(campaign.primaryValue, 21);
  approx(campaign.qualifiedLeads, 1);
  approx(campaign.allResults, 22);

  const campaignTotal = [
    { report_type: 'lead_generation', result_breakdown: { lead_form: 13 } },
    { report_type: 'lead_generation', result_breakdown: { lead_form: 21, qualified_lead: 1 } },
    { report_type: 'lead_generation', result_breakdown: { lead_form: 104 } },
  ].reduce((sum, row) => sum + getPrimaryOutcome(row), 0);
  approx(campaignTotal, 138);

  const cpl = sanitizeImportedMetrics({
    spend: aggregate.spend,
    conversions: getPrimaryOutcome(aggregate),
    qualified_leads: getQualifiedLeads(aggregate),
    all_results: getAllResults(aggregate),
    report_type: getCanonicalReportType(aggregate),
  });
  assert.strictEqual(cpl.report_type, 'lead_generation');
  approx(cpl.conversions, 138);
  approx(cpl.qualified_leads, 1);
  approx(cpl.all_results, 139);
  approx(cpl.cpl, 16949.12 / 138);
})();

(() => {
  approx(getPrimaryOutcome({
    report_type: 'lead_generation',
    result_breakdown: { lead_form: 104 },
  }), 104);

  approx(getPrimaryOutcome({
    report_type: 'lead_generation',
    result_type: 'lead_form,qualified_lead',
    result_value: 139,
    result_breakdown: { lead_form: 138, qualified_lead: 1 },
    conversions: 139,
  }), 138);
  approx(getQualifiedLeads({
    result_breakdown: { lead_form: 138, qualified_lead: 1 },
  }), 1);

  approx(getPrimaryOutcome({
    report_type: 'lead_generation',
    result_breakdown: { on_facebook_lead: 12, website_lead: 8, lead: 3 },
  }), 23);

  approx(getPrimaryOutcome({
    report_type: 'lead_generation',
    result_breakdown: { lead_form: 21, qualified_lead: 1 },
  }), 21);

  approx(getPrimaryOutcome({
    report_type: 'lead_generation',
    result_breakdown: { qualified_lead: 1 },
  }), 0);

  approx(getPrimaryOutcome({
    report_type: 'lead_generation',
    result_type: 'lead_form',
    result_value: 13,
  }), 13);

  approx(getPrimaryOutcome({
    report_type: 'lead_generation',
    conversions: 50,
  }), 50);

  approx(getPrimaryOutcome({
    report_type: 'lead_generation',
    result_breakdown: { lead_form: 50 },
    conversions: 50,
  }), 50);

  const aggregate = sanitizeImportedMetrics({
    spend: 16949.12,
    conversions: getPrimaryOutcome({
      report_type: 'lead_generation',
      result_breakdown: { lead_form: 138, qualified_lead: 1 },
    }),
  });

  approx(aggregate.conversions, 138);
  approx(aggregate.cpl, 16949.12 / 138);
})();

(() => {
  const hiddenAvailability = {
    hasSpend: true,
    hasImpressions: true,
    hasClicks: false,
    hasConversions: true,
    hasRevenue: false,
  };

  assert.strictEqual(isMetricAvailable('clicks', hiddenAvailability), false);
  assert.strictEqual(isMetricAvailable('ctr', hiddenAvailability), false);
  assert.strictEqual(isMetricAvailable('cpc', hiddenAvailability), false);
  assert.strictEqual(isMetricAvailable('roas', hiddenAvailability), false);
  assert.strictEqual(isMetricAvailable('spend', hiddenAvailability), true);
  assert.strictEqual(isMetricAvailable('conversions', hiddenAvailability), true);
  assert.strictEqual(isMetricAvailable('impressions', hiddenAvailability), true);

  const explicitZeroAvailability = {
    hasSpend: true,
    hasImpressions: true,
    hasClicks: true,
    hasConversions: true,
    hasRevenue: true,
  };

  assert.strictEqual(isMetricAvailable('clicks', explicitZeroAvailability), true);
  assert.strictEqual(isMetricAvailable('revenue', explicitZeroAvailability), true);
  assert.strictEqual(isMetricAvailable('ctr', explicitZeroAvailability), true);
  assert.strictEqual(isMetricAvailable('cpc', explicitZeroAvailability), true);
  assert.strictEqual(isMetricAvailable('roas', explicitZeroAvailability), true);

  const oneDistinctMonth = [...new Map([
    { month: 'Jul 2026', conversions: 206 },
    { month: 'Jul 2026', conversions: 206 },
  ].map((row) => [String(row.month), row])).values()];
  assert.strictEqual(oneDistinctMonth.length >= 2, false);

  const twoDistinctMonths = [...new Map([
    { month: 'Jun 2026', conversions: 100 },
    { month: 'Jul 2026', conversions: 206 },
  ].map((row) => [String(row.month), row])).values()];
  assert.strictEqual(twoDistinctMonths.length >= 2, true);

  const campaignRows = [
    { name: 'Auto Audience Leads campaign', spend: 12165.24, impressions: 96844, conversions: 166, cpa: 73.28457831325301 },
    { name: 'Chitrakut Carousel Leads campaign', spend: 6525.4, impressions: 10743, conversions: 35, cpa: 186.44 },
    { name: 'New Post Leads campaign', spend: 796.1, impressions: 1791, conversions: 5, cpa: 159.22 },
  ];
  approx(campaignRows.reduce((sum, row) => sum + row.spend, 0), 19486.74, 0.01);
  approx(campaignRows.reduce((sum, row) => sum + row.conversions, 0), 206);
})();

(() => {
  const validPdfPath = path.join(os.tmpdir(), `valid-${Date.now()}.pdf`);
  const invalidPdfPath = path.join(os.tmpdir(), `invalid-${Date.now()}.pdf`);

  fs.writeFileSync(validPdfPath, Buffer.from('%PDF-1.4\n%test\n'));
  fs.writeFileSync(invalidPdfPath, Buffer.from('<html>not pdf</html>'));

  assert.strictEqual(validateLocalPdf(validPdfPath), true);
  assert.throws(() => validateLocalPdf(invalidPdfPath), /valid PDF/);

  fs.unlinkSync(validPdfPath);
  fs.unlinkSync(invalidPdfPath);
})();

console.log('metrics validation tests passed');
