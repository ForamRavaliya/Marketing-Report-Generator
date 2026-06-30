
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

const monthlyDedupedMetricsCte = (whereSql) => `
  WITH base_rows AS (
    SELECT pd.*
    FROM performance_data pd
    WHERE ${whereSql}
  ),
  monthly_rollup AS (
    SELECT
      report_month,
      BOOL_OR(${isAggregateExpr}) AS has_aggregate,
      BOOL_OR(${isNotAggregateExpr}) AS has_campaign,
      SUM(COALESCE(spend, 0)) FILTER (WHERE ${isAggregateExpr}) AS aggregate_spend,
      SUM(COALESCE(reach, 0)) FILTER (WHERE ${isAggregateExpr}) AS aggregate_reach,
      SUM(COALESCE(impressions, 0)) FILTER (WHERE ${isAggregateExpr}) AS aggregate_impressions,
      SUM(COALESCE(clicks, 0)) FILTER (WHERE ${isAggregateExpr}) AS aggregate_clicks,
      SUM(COALESCE(conversions, 0)) FILTER (WHERE ${isAggregateExpr}) AS aggregate_conversions,
      SUM(COALESCE(revenue, 0)) FILTER (WHERE ${isAggregateExpr}) AS aggregate_revenue,
      SUM(COALESCE(spend, 0)) FILTER (WHERE ${isNotAggregateExpr}) AS campaign_spend,
      SUM(COALESCE(reach, 0)) FILTER (WHERE ${isNotAggregateExpr}) AS campaign_reach,
      SUM(COALESCE(impressions, 0)) FILTER (WHERE ${isNotAggregateExpr}) AS campaign_impressions,
      SUM(COALESCE(clicks, 0)) FILTER (WHERE ${isNotAggregateExpr}) AS campaign_clicks,
      SUM(COALESCE(conversions, 0)) FILTER (WHERE ${isNotAggregateExpr}) AS campaign_conversions,
      SUM(COALESCE(revenue, 0)) FILTER (WHERE ${isNotAggregateExpr}) AS campaign_revenue,
      MAX(report_type) AS report_type,
      BOOL_OR(COALESCE((raw_data->'mapping') ? 'spend', false) OR COALESCE(spend, 0) > 0) AS has_spend_field,
      BOOL_OR(COALESCE((raw_data->'mapping') ? 'reach', false) OR COALESCE(reach, 0) > 0) AS has_reach_field,
      BOOL_OR(COALESCE((raw_data->'mapping') ? 'impressions', false) OR COALESCE(impressions, 0) > 0) AS has_impressions_field,
      BOOL_OR(COALESCE((raw_data->'mapping') ? 'clicks', false) OR COALESCE(clicks, 0) > 0) AS has_clicks_field,
      BOOL_OR(COALESCE((raw_data->'mapping') ? 'conversions', false) OR COALESCE(conversions, 0) > 0) AS has_conversions_field,
      BOOL_OR(COALESCE((raw_data->'mapping') ? 'revenue', false) OR COALESCE(revenue, 0) > 0) AS has_revenue_field
    FROM base_rows pd
    GROUP BY report_month
  ),
  monthly_choice AS (
    SELECT
      *,
      has_aggregate
      AND has_campaign
      AND (
        (COALESCE(campaign_spend, 0) > 0 AND COALESCE(aggregate_spend, 0) BETWEEN campaign_spend * 1.8 AND campaign_spend * 2.2)
        OR (COALESCE(campaign_conversions, 0) > 0 AND COALESCE(aggregate_conversions, 0) BETWEEN campaign_conversions * 1.8 AND campaign_conversions * 2.2)
        OR (COALESCE(campaign_revenue, 0) > 0 AND COALESCE(aggregate_revenue, 0) BETWEEN campaign_revenue * 1.8 AND campaign_revenue * 2.2)
      ) AS aggregate_is_duplicate
    FROM monthly_rollup
  ),
  chosen_months AS (
    SELECT
      report_month,
      CASE WHEN aggregate_is_duplicate OR NOT has_aggregate THEN COALESCE(campaign_spend, 0) ELSE COALESCE(aggregate_spend, 0) END AS spend,
      CASE WHEN aggregate_is_duplicate OR NOT has_aggregate THEN COALESCE(campaign_reach, 0) ELSE COALESCE(aggregate_reach, 0) END AS reach,
      CASE WHEN aggregate_is_duplicate OR NOT has_aggregate THEN COALESCE(campaign_impressions, 0) ELSE COALESCE(aggregate_impressions, 0) END AS impressions,
      CASE WHEN aggregate_is_duplicate OR NOT has_aggregate THEN COALESCE(campaign_clicks, 0) ELSE COALESCE(aggregate_clicks, 0) END AS clicks,
      CASE WHEN aggregate_is_duplicate OR NOT has_aggregate THEN COALESCE(campaign_conversions, 0) ELSE COALESCE(aggregate_conversions, 0) END AS conversions,
      CASE WHEN aggregate_is_duplicate OR NOT has_aggregate THEN COALESCE(campaign_revenue, 0) ELSE COALESCE(aggregate_revenue, 0) END AS revenue,
      report_type,
      has_spend_field,
      has_reach_field,
      has_impressions_field,
      has_clicks_field,
      has_conversions_field,
      has_revenue_field
    FROM monthly_choice
  )
`;

const getSummaryMetrics = async (db, options) => {
  const { whereSql, params } = buildBaseFilters(options);

  const result = await db.query(
    `
    ${monthlyDedupedMetricsCte(whereSql)}
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
      CASE WHEN SUM(COALESCE(impressions, 0)) > 0
        THEN SUM(COALESCE(clicks, 0))::float / SUM(COALESCE(impressions, 0)) * 100
        ELSE 0
      END AS ctr,
      CASE WHEN SUM(COALESCE(clicks, 0)) > 0
        THEN SUM(COALESCE(spend, 0)) / SUM(COALESCE(clicks, 0))
        ELSE 0
      END AS cpc,
      CASE WHEN SUM(COALESCE(conversions, 0)) > 0
        THEN SUM(COALESCE(spend, 0)) / SUM(COALESCE(conversions, 0))
        ELSE 0
      END AS cpa,
      CASE WHEN SUM(COALESCE(spend, 0)) > 0
        THEN SUM(COALESCE(revenue, 0)) / SUM(COALESCE(spend, 0))
        ELSE 0
      END AS roas
    FROM chosen_months
    `,
    params
  );

  return result.rows[0] || {};
};

const getMonthlyTrends = async (db, options) => {
  const { whereSql, params } = buildBaseFilters(options);

  const result = await db.query(
    `
    ${monthlyDedupedMetricsCte(whereSql)}
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
      CASE WHEN spend > 0
        THEN revenue / spend
        ELSE 0
      END AS roas
    FROM chosen_months
    ORDER BY report_month
    `,
    params
  );

  return result.rows;
};

const getPlatformMetrics = async (db, options) => {
  const { whereSql, params } = buildBaseFilters(options);

  const result = await db.query(
    `
    WITH has_aggregate AS (
      SELECT EXISTS (
        SELECT 1
        FROM performance_data pd
        WHERE ${whereSql}
          AND ${isAggregateExpr}
      ) AS exists
    )
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
    CROSS JOIN has_aggregate
    WHERE ${whereSql}
      AND (
        (has_aggregate.exists = true AND ${isAggregateExpr})
        OR
        (has_aggregate.exists = false AND ${isNotAggregateExpr})
      )
    GROUP BY pd.platform
    ORDER BY SUM(COALESCE(pd.spend, 0)) DESC
    `,
    params
  );

  return result.rows;
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
      CASE WHEN SUM(COALESCE(pd.impressions, 0)) > 0
        THEN SUM(COALESCE(pd.clicks, 0))::float / SUM(COALESCE(pd.impressions, 0)) * 100
        ELSE 0
      END AS ctr,
      CASE WHEN SUM(COALESCE(pd.clicks, 0)) > 0
        THEN SUM(COALESCE(pd.spend, 0)) / SUM(COALESCE(pd.clicks, 0))
        ELSE 0
      END AS cpc,
      CASE WHEN SUM(COALESCE(pd.conversions, 0)) > 0
        THEN SUM(COALESCE(pd.spend, 0)) / SUM(COALESCE(pd.conversions, 0))
        ELSE 0
      END AS cpa
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

  return result.rows;
};

const getLatestReportMonth = async (db, options) => {
  const { whereSql, params } = buildBaseFilters(options);

  const result = await db.query(
    `
    SELECT MAX(pd.report_month) AS latest_month
    FROM performance_data pd
    WHERE ${whereSql}
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
      AND pd.report_month < $${params.length}
    `,
    params
  );

  return result.rows[0]?.previous_month || null;
};

module.exports = {
  getSummaryMetrics,
  getMonthlyTrends,
  getPlatformMetrics,
  getCampaignMetrics,
  getLatestReportMonth,
  getPreviousReportMonth,
};
