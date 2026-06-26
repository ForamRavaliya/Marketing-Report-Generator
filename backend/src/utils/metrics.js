const isAggregateExpr = "LOWER(TRIM(COALESCE(pd.external_campaign_name, ''))) = 'aggregate'";
const isNotAggregateExpr = "LOWER(TRIM(COALESCE(pd.external_campaign_name, ''))) <> 'aggregate'";

const buildBaseFilters = ({ clientId, dateStart, dateEnd, platform }, startIndex = 1) => {
  const filters = [`pd.client_id = $${startIndex}`];
  const params = [clientId];
  let idx = startIndex + 1;

  if (dateStart) {
    filters.push(`COALESCE(pd.date_range_start, pd.report_month) >= $${idx++}::date`);
    params.push(dateStart);
  }

  if (dateEnd) {
    filters.push(`COALESCE(pd.date_range_end, pd.report_month) <= $${idx++}::date`);
    params.push(dateEnd);
  }

  if (platform && platform !== 'all') {
    filters.push(`pd.platform = $${idx++}`);
    params.push(platform);
  }

  return {
    whereSql: filters.join(' AND '),
    params,
  };
};

const getSummaryMetrics = async (db, options) => {
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
      SUM(COALESCE(pd.spend, 0)) AS spend,
      SUM(COALESCE(pd.reach, 0)) AS reach,
      SUM(COALESCE(pd.impressions, 0)) AS impressions,
      SUM(COALESCE(pd.clicks, 0)) AS clicks,
      SUM(COALESCE(pd.conversions, 0)) AS conversions,
      SUM(COALESCE(pd.revenue, 0)) AS revenue,
      BOOL_OR(COALESCE((pd.raw_data->'mapping') ? 'spend', false) OR COALESCE(pd.spend, 0) > 0) AS has_spend_field,
      BOOL_OR(COALESCE((pd.raw_data->'mapping') ? 'reach', false) OR COALESCE(pd.reach, 0) > 0) AS has_reach_field,
      BOOL_OR(COALESCE((pd.raw_data->'mapping') ? 'impressions', false) OR COALESCE(pd.impressions, 0) > 0) AS has_impressions_field,
      BOOL_OR(COALESCE((pd.raw_data->'mapping') ? 'clicks', false) OR COALESCE(pd.clicks, 0) > 0) AS has_clicks_field,
      BOOL_OR(COALESCE((pd.raw_data->'mapping') ? 'conversions', false) OR COALESCE(pd.conversions, 0) > 0) AS has_conversions_field,
      BOOL_OR(COALESCE((pd.raw_data->'mapping') ? 'revenue', false) OR COALESCE(pd.revenue, 0) > 0) AS has_revenue_field,
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
      END AS cpa,
      CASE WHEN SUM(COALESCE(pd.spend, 0)) > 0
        THEN SUM(COALESCE(pd.revenue, 0)) / SUM(COALESCE(pd.spend, 0))
        ELSE 0
      END AS roas
    FROM performance_data pd
    CROSS JOIN has_aggregate
    WHERE ${whereSql}
      AND (
        (has_aggregate.exists = true AND ${isAggregateExpr})
        OR
        (has_aggregate.exists = false AND ${isNotAggregateExpr})
      )
    `,
    params
  );

  return result.rows[0] || {};
};

const getMonthlyTrends = async (db, options) => {
  const { whereSql, params } = buildBaseFilters(options);

  const result = await db.query(
    `
    WITH month_flags AS (
      SELECT
        pd.report_month,
        BOOL_OR(${isAggregateExpr}) AS has_aggregate
      FROM performance_data pd
      WHERE ${whereSql}
      GROUP BY pd.report_month
    )
    SELECT
      pd.report_month,
      TO_CHAR(pd.report_month, 'Mon YYYY') AS month,
      SUM(COALESCE(pd.spend, 0)) AS spend,
      SUM(COALESCE(pd.impressions, 0)) AS impressions,
      SUM(COALESCE(pd.clicks, 0)) AS clicks,
      SUM(COALESCE(pd.conversions, 0)) AS conversions,
      SUM(COALESCE(pd.revenue, 0)) AS revenue,
      CASE WHEN SUM(COALESCE(pd.spend, 0)) > 0
        THEN SUM(COALESCE(pd.revenue, 0)) / SUM(COALESCE(pd.spend, 0))
        ELSE 0
      END AS roas
    FROM performance_data pd
    JOIN month_flags mf ON mf.report_month = pd.report_month
    WHERE ${whereSql}
      AND (
        (mf.has_aggregate = true AND ${isAggregateExpr})
        OR
        (mf.has_aggregate = false AND ${isNotAggregateExpr})
      )
    GROUP BY pd.report_month
    ORDER BY pd.report_month
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
      SUM(COALESCE(pd.revenue, 0)) AS revenue
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
    ORDER BY SUM(COALESCE(pd.spend, 0)) DESC
    `,
    params
  );

  return result.rows;
};

module.exports = {
  getSummaryMetrics,
  getMonthlyTrends,
  getPlatformMetrics,
  getCampaignMetrics,
};