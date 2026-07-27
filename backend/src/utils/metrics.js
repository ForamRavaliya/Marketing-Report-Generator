
const safeNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};
const {
  mergeResultBreakdowns,
  normalizeResultBreakdown,
} = require('./importGranularity');

const nonNegative = (value) => Math.max(0, safeNumber(value, 0));

const PRIMARY_OUTCOME_KEYS = {
  lead_generation: [
    'lead_form',
    'on_facebook_lead',
    'website_lead',
    'website_leads',
    'onsite_conversion_lead_grouped',
    'lead',
    'leads',
  ],
  sales_campaign: ['purchase', 'purchases', 'website_purchase', 'website_purchases', 'omni_purchase', 'omni_purchases', 'order', 'orders'],
  app: ['app_install', 'mobile_app_install', 'app_activation', 'app_registration'],
};

const normalizeOutcomeKey = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const isApprovedOutcomeType = (resultType = '', reportType = '') => {
  const key = normalizeOutcomeKey(resultType);
  const allowed = PRIMARY_OUTCOME_KEYS[reportType];
  if (!allowed) return true;
  return allowed.includes(key);
};

const getBreakdownPrimaryOutcome = (breakdown = {}, reportType = '') => {
  const allowed = PRIMARY_OUTCOME_KEYS[reportType];
  if (!allowed) {
    return Object.values(breakdown).reduce((sum, value) => sum + nonNegative(value), 0);
  }

  return allowed.reduce((sum, key) => sum + nonNegative(breakdown[key]), 0);
};

const getAllResults = (row = {}) => {
  const breakdown = normalizeResultBreakdown(row.result_breakdown || row.resultBreakdown || {});
  const breakdownTotal = Object.values(breakdown).reduce((sum, value) => sum + nonNegative(value), 0);
  if (breakdownTotal > 0) return breakdownTotal;

  return nonNegative(row.result_value ?? row.resultValue ?? row.all_results ?? row.allResults ?? row.conversions);
};

const getQualifiedLeads = (row = {}) => {
  const breakdown = normalizeResultBreakdown(row.result_breakdown || row.resultBreakdown || {});
  if (Object.prototype.hasOwnProperty.call(breakdown, 'qualified_lead')) {
    return nonNegative(breakdown.qualified_lead);
  }

  return nonNegative(row.qualified_leads ?? row.qualifiedLeads);
};

const getCanonicalReportType = (row = {}, fallbackReportType = row.report_type || row.reportType || '') => {
  const fallback = String(fallbackReportType || '').trim().toLowerCase();
  const breakdown = normalizeResultBreakdown(row.result_breakdown || row.resultBreakdown || {});

  if (getBreakdownPrimaryOutcome(breakdown, 'lead_generation') > 0) return 'lead_generation';
  if (getBreakdownPrimaryOutcome(breakdown, 'sales_campaign') > 0) return 'sales_campaign';
  if (getBreakdownPrimaryOutcome(breakdown, 'app') > 0) return 'app';

  const hasBreakdown = Object.keys(breakdown).length > 0;
  const resultType = String(row.result_type || row.resultType || '').trim().toLowerCase();

  if (!hasBreakdown && resultType) {
    if (isApprovedOutcomeType(resultType, 'lead_generation')) return 'lead_generation';
    if (isApprovedOutcomeType(resultType, 'sales_campaign')) return 'sales_campaign';
    if (isApprovedOutcomeType(resultType, 'app')) return 'app';
  }

  if (fallback === 'ads') {
    return nonNegative(row.revenue) > 0 ? 'sales_campaign' : 'lead_generation';
  }

  if (fallback === 'app' && (hasBreakdown || resultType)) return 'needs_review';
  return fallback || 'needs_review';
};

const interpretResultSemantics = (row = {}, reportType = row.report_type || row.reportType || '') => {
  const canonicalReportType = getCanonicalReportType(row, reportType);
  const breakdown = normalizeResultBreakdown(row.result_breakdown || row.resultBreakdown || {});
  const hasBreakdown = Object.keys(breakdown).length > 0;
  const resultType = String(row.result_type || row.resultType || '').trim().toLowerCase();
  const resultValue = nonNegative(row.result_value ?? row.resultValue);
  let primaryValue = 0;

  if (hasBreakdown) {
    primaryValue = getBreakdownPrimaryOutcome(breakdown, canonicalReportType);
    if (canonicalReportType === 'needs_review') primaryValue = 0;
  } else if (resultValue > 0 && isApprovedOutcomeType(resultType, canonicalReportType)) {
    primaryValue = resultValue;
  } else {
    primaryValue = nonNegative(row.conversions);
  }

  return {
    reportType: canonicalReportType,
    primaryValue,
    qualifiedLeads: getQualifiedLeads(row),
    allResults: getAllResults(row),
  };
};

const getPrimaryOutcome = (row = {}, reportType = row.report_type || row.reportType || '') => {
  return interpretResultSemantics(row, reportType).primaryValue;
};

const calculateDerivedMetrics = (metrics = {}) => {
  const spend = nonNegative(metrics.spend);
  const clicks = nonNegative(metrics.clicks);
  const impressions = Math.max(nonNegative(metrics.impressions), clicks);
  const conversions = nonNegative(metrics.conversions);
  const revenue = nonNegative(metrics.revenue);

  return {
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpa: conversions > 0 ? spend / conversions : 0,
    cpl: conversions > 0 ? spend / conversions : 0,
    roas: spend > 0 ? revenue / spend : 0,
    conversionRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
  };
};

const sanitizeImportedMetrics = (metrics = {}) => {
  const base = {
    ...metrics,
    spend: nonNegative(metrics.spend),
    reach: nonNegative(metrics.reach),
    impressions: Math.max(nonNegative(metrics.impressions), nonNegative(metrics.clicks)),
    clicks: nonNegative(metrics.clicks),
    conversions: nonNegative(metrics.conversions),
    leads: nonNegative(metrics.leads ?? metrics.conversions),
    qualified_leads: nonNegative(metrics.qualified_leads ?? metrics.qualifiedLeads),
    all_results: nonNegative(metrics.all_results ?? metrics.allResults),
    purchases: nonNegative(metrics.purchases ?? metrics.conversions),
    revenue: nonNegative(metrics.revenue),
    followers: nonNegative(metrics.followers),
    orders: nonNegative(metrics.orders),
    quantity: nonNegative(metrics.quantity),
    refunds: nonNegative(metrics.refunds),
    profit: safeNumber(metrics.profit, 0),
  };

  const derived = calculateDerivedMetrics(base);

  return {
    ...base,
    ...derived,
    margin: base.revenue > 0 ? (base.profit / base.revenue) * 100 : 0,
    aov: base.orders > 0 ? base.revenue / base.orders : nonNegative(metrics.aov),
  };
};

const normalizeMetricRecord = (row = {}) => {
  const semantics = interpretResultSemantics(row);
  return sanitizeImportedMetrics({
    ...row,
    report_type: semantics.reportType,
    conversions: semantics.primaryValue,
    qualified_leads: semantics.qualifiedLeads,
    all_results: semantics.allResults,
  });
};

const buildMonthlySummary = (rows = []) => {
  const summary = rows.reduce(
    (total, row) => {
      const metrics = row?.metrics || row || {};

      total.spend += safeNumber(metrics.spend, 0);
      total.reach += safeNumber(metrics.reach, 0);
      total.impressions += safeNumber(metrics.impressions, 0);
      total.clicks += safeNumber(metrics.clicks, 0);
      total.conversions += getPrimaryOutcome(metrics);
      total.qualified_leads += getQualifiedLeads(metrics);
      total.all_results += getAllResults(metrics);
      total.revenue += safeNumber(metrics.revenue, 0);
      total.followers += safeNumber(metrics.followers, 0);
      total.orders += safeNumber(metrics.orders, 0);
      total.quantity += safeNumber(metrics.quantity, 0);
      total.refunds += safeNumber(metrics.refunds, 0);
      total.profit += safeNumber(metrics.profit, 0);
      total.result_value += safeNumber(metrics.result_value, 0);
      total.result_breakdown = mergeResultBreakdowns([
        total.result_breakdown,
        metrics.result_breakdown,
      ]);

      return total;
    },
    {
      spend: 0,
      reach: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      qualified_leads: 0,
      all_results: 0,
      revenue: 0,
      followers: 0,
      orders: 0,
      quantity: 0,
      refunds: 0,
      profit: 0,
      result_value: 0,
      result_breakdown: {},
    }
  );

  return sanitizeImportedMetrics({
    ...summary,
    leads: summary.conversions,
    qualified_leads: summary.qualified_leads,
    all_results: summary.all_results,
    purchases: summary.conversions,
  });
};

const calculatePercentChange = (current, previous) => {
  const currentNum = safeNumber(current, 0);
  const previousNum = safeNumber(previous, 0);

  if (previousNum === 0) {
    return {
      value: null,
      label: 'No previous data',
      hasPreviousData: false,
    };
  }

  return {
    value: ((currentNum - previousNum) / Math.abs(previousNum)) * 100,
    label: null,
    hasPreviousData: true,
  };
};

const isMetricAvailable = (metricKey, availability = {}) => {
  const key = String(metricKey || '').toLowerCase();

  if (key === 'spend') return Boolean(availability.hasSpend);
  if (key === 'reach') return Boolean(availability.hasReach);
  if (key === 'impressions') return Boolean(availability.hasImpressions);
  if (key === 'clicks') return Boolean(availability.hasClicks);
  if (key === 'conversions' || key === 'leads' || key === 'purchases') return Boolean(availability.hasConversions);
  if (key === 'revenue') return Boolean(availability.hasRevenue);
  if (key === 'ctr') return Boolean(availability.hasClicks && availability.hasImpressions);
  if (key === 'cpc') return Boolean(availability.hasSpend && availability.hasClicks);
  if (key === 'cpa' || key === 'cpl' || key === 'cpp') return Boolean(availability.hasSpend && availability.hasConversions);
  if (key === 'roas') return Boolean(availability.hasSpend && availability.hasRevenue);

  return false;
};

const jsonbNumberSql = (alias, key) =>
  `COALESCE(NULLIF(${alias}.result_breakdown->>'${key}', '')::numeric, 0)`;

const resultBreakdownExistsSql = (alias = 'pd') =>
  `COALESCE(${alias}.result_breakdown, '{}'::jsonb) <> '{}'::jsonb`;

const primaryLeadBreakdownSql = (alias = 'pd') => `(
    ${jsonbNumberSql(alias, 'lead_form')}
    + ${jsonbNumberSql(alias, 'on_facebook_lead')}
    + ${jsonbNumberSql(alias, 'website_lead')}
    + ${jsonbNumberSql(alias, 'website_leads')}
    + ${jsonbNumberSql(alias, 'onsite_conversion_lead_grouped')}
    + ${jsonbNumberSql(alias, 'lead')}
    + ${jsonbNumberSql(alias, 'leads')}
  )`;

const primaryPurchaseBreakdownSql = (alias = 'pd') => `(
    ${jsonbNumberSql(alias, 'purchase')}
    + ${jsonbNumberSql(alias, 'purchases')}
    + ${jsonbNumberSql(alias, 'website_purchase')}
    + ${jsonbNumberSql(alias, 'website_purchases')}
    + ${jsonbNumberSql(alias, 'omni_purchase')}
    + ${jsonbNumberSql(alias, 'omni_purchases')}
    + ${jsonbNumberSql(alias, 'order')}
    + ${jsonbNumberSql(alias, 'orders')}
  )`;

const primaryAppBreakdownSql = (alias = 'pd') => `(
    ${jsonbNumberSql(alias, 'app_install')}
    + ${jsonbNumberSql(alias, 'mobile_app_install')}
    + ${jsonbNumberSql(alias, 'app_activation')}
    + ${jsonbNumberSql(alias, 'app_registration')}
  )`;

const qualifiedLeadSql = (alias = 'pd') => jsonbNumberSql(alias, 'qualified_lead');

const allResultsSql = (alias = 'pd') => `
  CASE
    WHEN ${resultBreakdownExistsSql(alias)} THEN (
      SELECT COALESCE(SUM(value::numeric), 0)
      FROM jsonb_each_text(${alias}.result_breakdown) AS rb(key, value)
      WHERE NULLIF(value, '') IS NOT NULL
    )
    ELSE COALESCE(${alias}.result_value, ${alias}.conversions, 0)
  END
`;

const semanticReportTypeSql = (alias = 'pd') => `
  CASE
    WHEN ${primaryLeadBreakdownSql(alias)} > 0 THEN 'lead_generation'
    WHEN ${primaryPurchaseBreakdownSql(alias)} > 0 THEN 'sales_campaign'
    WHEN ${primaryAppBreakdownSql(alias)} > 0 THEN 'app'
    WHEN NOT ${resultBreakdownExistsSql(alias)}
      AND LOWER(TRIM(COALESCE(${alias}.result_type, ''))) IN (
        'lead_form', 'lead form', 'on_facebook_lead', 'on facebook lead', 'website_lead', 'website lead', 'website_leads', 'website leads', 'onsite_conversion_lead_grouped', 'onsite conversion lead grouped', 'lead', 'leads'
      ) THEN 'lead_generation'
    WHEN NOT ${resultBreakdownExistsSql(alias)}
      AND LOWER(TRIM(COALESCE(${alias}.result_type, ''))) IN (
        'purchase', 'purchases', 'website_purchase', 'website purchase', 'website_purchases', 'website purchases', 'omni_purchase', 'omni purchase', 'omni_purchases', 'omni purchases', 'order', 'orders'
      ) THEN 'sales_campaign'
    WHEN NOT ${resultBreakdownExistsSql(alias)}
      AND LOWER(TRIM(COALESCE(${alias}.result_type, ''))) IN (
        'app_install', 'app install', 'mobile_app_install', 'mobile app install', 'app_activation', 'app activation', 'app_registration', 'app registration'
      ) THEN 'app'
    WHEN LOWER(TRIM(COALESCE(${alias}.report_type, ''))) = 'ads'
      AND COALESCE(${alias}.revenue, 0) > 0
      AND COALESCE(${alias}.spend, 0) > 0 THEN 'sales_campaign'
    WHEN LOWER(TRIM(COALESCE(${alias}.report_type, ''))) = 'ads'
      AND COALESCE(${alias}.conversions, 0) > 0 THEN 'lead_generation'
    WHEN LOWER(TRIM(COALESCE(${alias}.report_type, ''))) = 'app'
      AND LOWER(TRIM(COALESCE(${alias}.result_type, ''))) NOT IN ('', 'results', 'result') THEN 'app'
    WHEN LOWER(TRIM(COALESCE(${alias}.report_type, ''))) = 'app'
      AND COALESCE(${alias}.result_breakdown, '{}'::jsonb) = '{}'::jsonb
      AND LOWER(TRIM(COALESCE(${alias}.result_type, ''))) = '' THEN 'app'
    WHEN LOWER(TRIM(COALESCE(${alias}.report_type, ''))) IN ('sales_campaign', 'lead_generation', 'sales_data', 'traffic', 'engagement', 'acquisition')
      THEN LOWER(TRIM(COALESCE(${alias}.report_type, '')))
    ELSE 'needs_review'
  END
`;

const primaryOutcomeSql = (alias = 'pd') => `
  CASE
    WHEN ${semanticReportTypeSql(alias)} = 'lead_generation' THEN
      CASE
        WHEN ${resultBreakdownExistsSql(alias)} THEN ${primaryLeadBreakdownSql(alias)}
        WHEN LOWER(TRIM(COALESCE(${alias}.result_type, ''))) IN (
          'lead_form', 'lead form', 'on_facebook_lead', 'on facebook lead', 'website_lead', 'website lead', 'website_leads', 'website leads', 'onsite_conversion_lead_grouped', 'onsite conversion lead grouped', 'lead', 'leads'
        ) THEN COALESCE(${alias}.result_value, 0)
        ELSE COALESCE(${alias}.conversions, 0)
      END
    WHEN ${semanticReportTypeSql(alias)} = 'sales_campaign' THEN
      CASE
        WHEN ${resultBreakdownExistsSql(alias)} THEN ${primaryPurchaseBreakdownSql(alias)}
        WHEN LOWER(TRIM(COALESCE(${alias}.result_type, ''))) IN (
          'purchase', 'purchases', 'website_purchase', 'website purchase', 'website_purchases', 'website purchases', 'omni_purchase', 'omni purchase', 'omni_purchases', 'omni purchases', 'order', 'orders'
        ) THEN COALESCE(${alias}.result_value, 0)
        ELSE COALESCE(${alias}.conversions, 0)
      END
    WHEN ${semanticReportTypeSql(alias)} = 'app' THEN
      CASE
        WHEN ${resultBreakdownExistsSql(alias)} THEN ${primaryAppBreakdownSql(alias)}
        WHEN LOWER(TRIM(COALESCE(${alias}.result_type, ''))) IN (
          'app_install', 'app install', 'mobile_app_install', 'mobile app install', 'app_activation', 'app activation', 'app_registration', 'app registration'
        ) THEN COALESCE(${alias}.result_value, 0)
        ELSE COALESCE(${alias}.conversions, 0)
      END
    ELSE CASE WHEN ${resultBreakdownExistsSql(alias)} THEN 0 ELSE COALESCE(${alias}.conversions, 0) END
  END
`;

  const normalizeReportTypeSql = `
    CASE
      WHEN SUM(CASE WHEN ${semanticReportTypeSql('pd')} = 'lead_generation' THEN ${primaryOutcomeSql('pd')} ELSE 0 END) > 0
        THEN 'lead_generation'
      WHEN SUM(CASE WHEN ${semanticReportTypeSql('pd')} = 'sales_campaign' THEN ${primaryOutcomeSql('pd')} ELSE 0 END) > 0
        THEN 'sales_campaign'
      WHEN SUM(CASE WHEN ${semanticReportTypeSql('pd')} = 'app' THEN ${primaryOutcomeSql('pd')} ELSE 0 END) > 0
        THEN 'app'
      WHEN MAX(${semanticReportTypeSql('pd')}) <> 'needs_review'
        THEN MAX(${semanticReportTypeSql('pd')})
      ELSE 'needs_review'
    END
  `;

const isAggregateExpr = "LOWER(TRIM(COALESCE(pd.external_campaign_name, ''))) = 'aggregate'";
const isNotAggregateExpr = "LOWER(TRIM(COALESCE(pd.external_campaign_name, ''))) <> 'aggregate'";

const buildBaseFilters = ({ clientId, dateStart, dateEnd, platform, reportType }, startIndex = 1) => {
  const filters = [`pd.client_id = $${startIndex}`];
  const params = [clientId];
  let idx = startIndex + 1;

  if (dateStart) {
    filters.push(`COALESCE(pd.date_range_end, pd.report_month) >= $${idx++}::date`);
    params.push(dateStart);
  }

  if (dateEnd) {
    filters.push(`COALESCE(pd.date_range_start, pd.report_month) <= $${idx++}::date`);
    params.push(dateEnd);
  }

  if (platform && platform !== 'all') {
    filters.push(`pd.platform = $${idx++}`);
    params.push(platform);
  }

  if (reportType && reportType !== 'all') {
    filters.push(`pd.report_type = $${idx++}`);
    params.push(reportType);
  }

  return {
    whereSql: filters.join(' AND '),
    params,
  };
};

const monthlyAggregateMetricsCte = (whereSql) => `
  WITH chosen_months AS (
    SELECT
      report_month,
      SUM(COALESCE(spend, 0)) AS spend,
      SUM(COALESCE(reach, 0)) AS reach,
      SUM(COALESCE(impressions, 0)) AS impressions,
      SUM(COALESCE(clicks, 0)) AS clicks,
      SUM(${primaryOutcomeSql('pd')}) AS conversions,
      SUM(${qualifiedLeadSql('pd')}) AS qualified_leads,
      SUM(${allResultsSql('pd')}) AS all_results,
      SUM(COALESCE(revenue, 0)) AS revenue,
      ${normalizeReportTypeSql} AS report_type,
      BOOL_OR(COALESCE((raw_data->'mapping') ? 'spend', false) OR COALESCE(spend, 0) > 0) AS has_spend_field,
      BOOL_OR(COALESCE((raw_data->'mapping') ? 'reach', false) OR COALESCE(reach, 0) > 0) AS has_reach_field,
      BOOL_OR(COALESCE((raw_data->'mapping') ? 'impressions', false) OR COALESCE(impressions, 0) > 0) AS has_impressions_field,
      BOOL_OR(COALESCE((raw_data->'mapping') ? 'clicks', false) OR COALESCE(clicks, 0) > 0) AS has_clicks_field,
      BOOL_OR(
        COALESCE((raw_data->'mapping') ? 'conversions', false)
        OR COALESCE(conversions, 0) > 0
        OR COALESCE(result_value, 0) > 0
        OR ${resultBreakdownExistsSql('pd')}
      ) AS has_conversions_field,
      BOOL_OR(COALESCE((raw_data->'mapping') ? 'revenue', false) OR COALESCE(revenue, 0) > 0) AS has_revenue_field
    FROM performance_data pd
    WHERE ${whereSql}
      AND ${isAggregateExpr}
    GROUP BY report_month
  )
`;

const getSummaryMetrics = async (db, options) => {
  const { whereSql, params } = buildBaseFilters(options);

  const result = await db.query(
    `
    ${monthlyAggregateMetricsCte(whereSql)}
    SELECT
      SUM(COALESCE(spend, 0)) AS spend,
      SUM(COALESCE(reach, 0)) AS reach,
      SUM(COALESCE(impressions, 0)) AS impressions,
      SUM(COALESCE(clicks, 0)) AS clicks,
      SUM(COALESCE(conversions, 0)) AS conversions,
      SUM(COALESCE(qualified_leads, 0)) AS qualified_leads,
      SUM(COALESCE(all_results, 0)) AS all_results,
      SUM(COALESCE(revenue, 0)) AS revenue,
      MAX(report_type) AS report_type,
      0 AS orders,
      0 AS quantity,
      0 AS refunds,
      0 AS profit,
      0 AS aov,
      0 AS margin,
      BOOL_OR(has_spend_field) AS has_spend_field,
      BOOL_OR(has_reach_field) AS has_reach_field,
      BOOL_OR(has_impressions_field) AS has_impressions_field,
      BOOL_OR(has_clicks_field) AS has_clicks_field,
      BOOL_OR(has_conversions_field) AS has_conversions_field,
      BOOL_OR(has_revenue_field) AS has_revenue_field,
      0 AS ctr,
      0 AS cpc,
      0 AS cpa,
      0 AS cpl,
      0 AS roas,
      0 AS conversion_rate
    FROM chosen_months
    `,
    params
  );

  return normalizeMetricRecord(result.rows[0] || {});
};

const getMonthlyTrends = async (db, options) => {
  const { whereSql, params } = buildBaseFilters(options);

  const result = await db.query(
    `
    ${monthlyAggregateMetricsCte(whereSql)}
    SELECT
      report_month,
      TO_CHAR(report_month, 'Mon YYYY') AS month,
      spend,
      impressions,
      clicks,
      conversions,
      qualified_leads,
      all_results,
      revenue,
      report_type,
      0 AS orders,
      0 AS quantity,
      0 AS profit,
      0 AS ctr,
      0 AS cpc,
      0 AS cpa,
      0 AS cpl,
      0 AS roas
    FROM chosen_months
    ORDER BY report_month
    `,
    params
  );

  return result.rows.map(normalizeMetricRecord);
};

const getPlatformMetrics = async (db, options) => {
  const { whereSql, params } = buildBaseFilters(options);

  const result = await db.query(
    `
    SELECT
      pd.platform,
      SUM(COALESCE(pd.spend, 0)) AS spend,
      SUM(COALESCE(pd.impressions, 0)) AS impressions,
      SUM(COALESCE(pd.clicks, 0)) AS clicks,
      SUM(${primaryOutcomeSql('pd')}) AS conversions,
      SUM(${qualifiedLeadSql('pd')}) AS qualified_leads,
      SUM(${allResultsSql('pd')}) AS all_results,
      SUM(COALESCE(pd.revenue, 0)) AS revenue,
      ${normalizeReportTypeSql} AS report_type,
      SUM(COALESCE((pd.raw_data->'salesMetrics'->>'orders')::numeric, 0)) AS orders,
      SUM(COALESCE((pd.raw_data->'salesMetrics'->>'quantity')::numeric, 0)) AS quantity,
      SUM(COALESCE((pd.raw_data->'salesMetrics'->>'profit')::numeric, 0)) AS profit
    FROM performance_data pd
    WHERE ${whereSql}
      AND ${isAggregateExpr}
    GROUP BY pd.platform
    ORDER BY SUM(COALESCE(pd.spend, 0)) DESC
    `,
    params
  );

  const rows = result.rows.map(normalizeMetricRecord);
  const totalSpend = rows.reduce((sum, row) => sum + safeNumber(row.spend, 0), 0);

  return rows.map((row) => ({
    ...row,
    platform_contribution: totalSpend > 0 ? (safeNumber(row.spend, 0) / totalSpend) * 100 : 0,
    spend_percentage: totalSpend > 0 ? (safeNumber(row.spend, 0) / totalSpend) * 100 : 0,
  }));
};

const getCampaignMetrics = async (db, options) => {
  const { whereSql, params } = buildBaseFilters(options);

  const validCampaignNameSql = `
    COALESCE(
      CASE
        WHEN c.name IS NOT NULL
          AND NULLIF(TRIM(c.name), '') IS NOT NULL
          AND LOWER(TRIM(c.name)) NOT IN (
            'aggregate', 'total', 'overall', 'account total',
            'unknown campaign', 'unknown camp', 'campaign name n/a', 'name n/a'
          )
        THEN TRIM(c.name)
      END,
      CASE
        WHEN pd.external_campaign_name IS NOT NULL
          AND NULLIF(TRIM(pd.external_campaign_name), '') IS NOT NULL
          AND LOWER(TRIM(pd.external_campaign_name)) NOT IN (
            'aggregate', 'total', 'overall', 'account total',
            'unknown campaign', 'unknown camp', 'campaign name n/a', 'name n/a'
          )
        THEN TRIM(pd.external_campaign_name)
      END
    )
  `;

  const result = await db.query(
    `
    WITH candidate_rows AS (
      SELECT
        pd.*,
        ${validCampaignNameSql} AS canonical_campaign_name,
        CASE COALESCE(NULLIF(TRIM(pd.row_level), ''), 'campaign')
          WHEN 'campaign' THEN 1
          WHEN 'ad_set' THEN 2
          WHEN 'ad' THEN 3
          ELSE 4
        END AS level_priority
      FROM performance_data pd
      LEFT JOIN campaigns c ON pd.campaign_id = c.id
      WHERE ${whereSql}
        AND ${isNotAggregateExpr}
        AND ${validCampaignNameSql} IS NOT NULL
    ),
    preferred_level AS (
      SELECT MIN(level_priority) AS level_priority
      FROM candidate_rows pd
      WHERE
        COALESCE(pd.spend, 0) > 0
        OR COALESCE(pd.clicks, 0) > 0
        OR ${primaryOutcomeSql('pd')} > 0
        OR COALESCE(pd.revenue, 0) > 0
    )
    SELECT
      COALESCE(pd.campaign_id::text, LOWER(TRIM(pd.external_campaign_name))) AS campaign_key,
      pd.canonical_campaign_name AS name,
      pd.platform,
      SUM(COALESCE(pd.spend, 0)) AS spend,
      SUM(COALESCE(pd.impressions, 0)) AS impressions,
      SUM(COALESCE(pd.clicks, 0)) AS clicks,
      SUM(${primaryOutcomeSql('pd')}) AS conversions,
      SUM(${qualifiedLeadSql('pd')}) AS qualified_leads,
      SUM(${allResultsSql('pd')}) AS all_results,
      SUM(COALESCE(pd.revenue, 0)) AS revenue,
      ${normalizeReportTypeSql} AS report_type,
      SUM(COALESCE((pd.raw_data->'salesMetrics'->>'orders')::numeric, 0)) AS orders,
      SUM(COALESCE((pd.raw_data->'salesMetrics'->>'quantity')::numeric, 0)) AS quantity,
      SUM(COALESCE((pd.raw_data->'salesMetrics'->>'refunds')::numeric, 0)) AS refunds,
      SUM(COALESCE((pd.raw_data->'salesMetrics'->>'profit')::numeric, 0)) AS profit,
      0 AS ctr,
      0 AS cpc,
      0 AS cpa,
      0 AS cpl,
      0 AS roas
    FROM candidate_rows pd
    WHERE pd.level_priority = (SELECT level_priority FROM preferred_level)
    GROUP BY
      COALESCE(pd.campaign_id::text, LOWER(TRIM(pd.external_campaign_name))),
      pd.canonical_campaign_name,
      pd.platform
    HAVING
      SUM(COALESCE(pd.spend, 0)) > 0
      OR SUM(COALESCE(pd.clicks, 0)) > 0
      OR SUM(${primaryOutcomeSql('pd')}) > 0
      OR SUM(COALESCE(pd.revenue, 0)) > 0
    ORDER BY SUM(COALESCE(pd.spend, 0)) DESC
    `,
    params
  );

  const rows = result.rows.map(normalizeMetricRecord);
  const totalSpend = rows.reduce((sum, row) => sum + safeNumber(row.spend, 0), 0);

  return rows.map((row) => ({
    ...row,
    spend_percentage: totalSpend > 0 ? (safeNumber(row.spend, 0) / totalSpend) * 100 : 0,
  }));
};

const getLatestReportMonth = async (db, options) => {
  const { whereSql, params } = buildBaseFilters(options);

  const result = await db.query(
    `
    SELECT MAX(pd.report_month) AS latest_month
    FROM performance_data pd
    WHERE ${whereSql}
      AND ${isAggregateExpr}
    `,
    params
  );

  return result.rows[0]?.latest_month || null;
};

const getPreviousReportMonth = async (db, options, currentMonth) => {
  if (!currentMonth) return null;

  const { whereSql, params } = buildBaseFilters(options);
  params.push(currentMonth);

  const result = await db.query(
    `
    SELECT MAX(pd.report_month) AS previous_month
    FROM performance_data pd
    WHERE ${whereSql}
      AND ${isAggregateExpr}
      AND pd.report_month < $${params.length}
    `,
    params
  );

  return result.rows[0]?.previous_month || null;
};

module.exports = {
  safeNumber,
  nonNegative,
  calculateDerivedMetrics,
  getPrimaryOutcome,
  getQualifiedLeads,
  getAllResults,
  getCanonicalReportType,
  interpretResultSemantics,
  allResultsSql,
  qualifiedLeadSql,
  primaryOutcomeSql,
  sanitizeImportedMetrics,
  normalizeMetricRecord,
  buildMonthlySummary,
  calculatePercentChange,
  isMetricAvailable,
  getSummaryMetrics,
  getMonthlyTrends,
  getPlatformMetrics,
  getCampaignMetrics,
  getLatestReportMonth,
  getPreviousReportMonth,
};
