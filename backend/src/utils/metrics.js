
const safeNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const nonNegative = (value) => Math.max(0, safeNumber(value, 0));

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

const normalizeMetricRecord = (row = {}) => sanitizeImportedMetrics(row);

const buildMonthlySummary = (rows = []) => {
  const summary = rows.reduce(
    (total, row) => {
      const metrics = row?.metrics || row || {};

      total.spend += safeNumber(metrics.spend, 0);
      total.reach += safeNumber(metrics.reach, 0);
      total.impressions += safeNumber(metrics.impressions, 0);
      total.clicks += safeNumber(metrics.clicks, 0);
      total.conversions += safeNumber(metrics.conversions, 0);
      total.revenue += safeNumber(metrics.revenue, 0);
      total.followers += safeNumber(metrics.followers, 0);
      total.orders += safeNumber(metrics.orders, 0);
      total.quantity += safeNumber(metrics.quantity, 0);
      total.refunds += safeNumber(metrics.refunds, 0);
      total.profit += safeNumber(metrics.profit, 0);

      return total;
    },
    {
      spend: 0,
      reach: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      followers: 0,
      orders: 0,
      quantity: 0,
      refunds: 0,
      profit: 0,
    }
  );

  return sanitizeImportedMetrics({
    ...summary,
    leads: summary.conversions,
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

  const normalizeReportTypeSql = `
    CASE
      WHEN MAX(pd.report_type) IN ('sales_campaign', 'lead_generation', 'sales_data')
        THEN MAX(pd.report_type)

      WHEN MAX(pd.report_type) = 'ads'
        AND SUM(COALESCE(pd.revenue, 0)) > 0
        AND SUM(COALESCE(pd.spend, 0)) > 0
        THEN 'sales_campaign'

      WHEN MAX(pd.report_type) = 'ads'
        AND SUM(COALESCE(pd.conversions, 0)) > 0
        THEN 'lead_generation'

      WHEN MAX(pd.report_type) IS NOT NULL
        THEN MAX(pd.report_type)

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
      SUM(COALESCE(conversions, 0)) AS conversions,
      SUM(COALESCE(revenue, 0)) AS revenue,
      MAX(report_type) AS report_type,
      BOOL_OR(COALESCE((raw_data->'mapping') ? 'spend', false) OR COALESCE(spend, 0) > 0) AS has_spend_field,
      BOOL_OR(COALESCE((raw_data->'mapping') ? 'reach', false) OR COALESCE(reach, 0) > 0) AS has_reach_field,
      BOOL_OR(COALESCE((raw_data->'mapping') ? 'impressions', false) OR COALESCE(impressions, 0) > 0) AS has_impressions_field,
      BOOL_OR(COALESCE((raw_data->'mapping') ? 'clicks', false) OR COALESCE(clicks, 0) > 0) AS has_clicks_field,
      BOOL_OR(COALESCE((raw_data->'mapping') ? 'conversions', false) OR COALESCE(conversions, 0) > 0) AS has_conversions_field,
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
      SUM(COALESCE(pd.conversions, 0)) AS conversions,
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
    SELECT
      COALESCE(pd.campaign_id::text, LOWER(TRIM(pd.external_campaign_name))) AS campaign_key,
      ${validCampaignNameSql} AS name,
      pd.platform,
      SUM(COALESCE(pd.spend, 0)) AS spend,
      SUM(COALESCE(pd.impressions, 0)) AS impressions,
      SUM(COALESCE(pd.clicks, 0)) AS clicks,
      SUM(COALESCE(pd.conversions, 0)) AS conversions,
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
    FROM performance_data pd
    LEFT JOIN campaigns c ON pd.campaign_id = c.id
    WHERE ${whereSql}
      AND ${isNotAggregateExpr}
      AND ${validCampaignNameSql} IS NOT NULL
    GROUP BY
      COALESCE(pd.campaign_id::text, LOWER(TRIM(pd.external_campaign_name))),
      ${validCampaignNameSql},
      pd.platform
    HAVING
      SUM(COALESCE(pd.spend, 0)) > 0
      OR SUM(COALESCE(pd.clicks, 0)) > 0
      OR SUM(COALESCE(pd.conversions, 0)) > 0
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
  sanitizeImportedMetrics,
  normalizeMetricRecord,
  buildMonthlySummary,
  calculatePercentChange,
  getSummaryMetrics,
  getMonthlyTrends,
  getPlatformMetrics,
  getCampaignMetrics,
  getLatestReportMonth,
  getPreviousReportMonth,
};
