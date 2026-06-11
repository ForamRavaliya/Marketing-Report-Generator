const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Get performance summary for a client
router.get('/summary/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { startDate, endDate, platform } = req.query;

   let whereClause = `
     WHERE pd.client_id = $1
     AND pd.external_campaign_name = 'aggregate'
   `;
    const params = [clientId];
    let paramIdx = 2;

    if (startDate) {
      whereClause += ` AND pd.report_month >= $${paramIdx++}`;
      params.push(new Date(startDate));
    }
    if (endDate) {
      whereClause += ` AND pd.report_month <= $${paramIdx++}`;
      params.push(new Date(endDate));
    }
    if (platform && platform !== 'all') {
      whereClause += ` AND pd.platform = $${paramIdx++}`;
      params.push(platform);
    }

    const result = await db.query(
      `SELECT 
         SUM(COALESCE(spend, 0)) as total_spend,
         SUM(COALESCE(reach, 0)) as total_reach,
         SUM(COALESCE(impressions, 0)) as total_impressions,
         SUM(COALESCE(clicks, 0)) as total_clicks,

         CASE WHEN SUM(COALESCE(impressions,0)) > 0
           THEN SUM(clicks)::float / SUM(impressions) * 100 ELSE 0 END as avg_ctr,

         CASE WHEN SUM(COALESCE(clicks,0)) > 0
           THEN SUM(spend) / SUM(clicks) ELSE 0 END as avg_cpc,

         SUM(COALESCE(conversions,0)) as total_conversions,

         CASE WHEN SUM(COALESCE(conversions,0)) > 0
           THEN SUM(spend) / SUM(conversions) ELSE 0 END as avg_cpa,

         CASE WHEN SUM(COALESCE(spend,0)) > 0
           THEN SUM(revenue) / SUM(spend) ELSE 0 END as avg_roas,

         SUM(COALESCE(revenue,0)) as total_revenue,
         COUNT(DISTINCT pd.id) as data_points
       FROM performance_data pd ${whereClause}`,
      params
    );

   const row = result.rows[0] || {};

   res.json({
     spend: parseFloat(row.total_spend) || 0,
     reach: parseFloat(row.total_reach) || 0,
     impressions: parseFloat(row.total_impressions) || 0,
     clicks: parseFloat(row.total_clicks) || 0,
     conversions: parseFloat(row.total_conversions) || 0,
     ctr: parseFloat(row.avg_ctr) || 0,
     cpc: parseFloat(row.avg_cpc) || 0,
     cpa: parseFloat(row.avg_cpa) || 0,
     roas: parseFloat(row.avg_roas) || 0,
     revenue: parseFloat(row.total_revenue) || 0,
     dataPoints: parseInt(row.data_points) || 0,
   });
  } catch (error) {
    console.error('Summary error:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// Monthly trend data
router.get('/trends/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { months = 6, platform } = req.query;

    let whereClause = `
      WHERE pd.client_id = $1
      AND pd.external_campaign_name = 'aggregate'
    `;
    const params = [clientId];

    if (platform && platform !== 'all') {
      whereClause += ` AND pd.platform = $2`;
      params.push(platform);
    }

    const result = await db.query(
      `SELECT 
        TO_CHAR(report_month, 'YYYY-MM') as month,
        report_month,
        platform,
        SUM(spend) as spend,
        SUM(impressions) as impressions,
        SUM(clicks) as clicks,
        CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions) * 100 ELSE 0 END as ctr,
        CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END as cpc,
        SUM(conversions) as conversions,
        CASE WHEN SUM(conversions) > 0 THEN SUM(spend) / SUM(conversions) ELSE 0 END as cpa,
        CASE WHEN SUM(spend) > 0 THEN SUM(revenue) / SUM(spend) ELSE 0 END as roas
       FROM performance_data pd ${whereClause}
       GROUP BY report_month, platform
       ORDER BY report_month DESC
       LIMIT $${params.length + 1}`,
      [...params, parseInt(months) * 4]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// Month-over-month comparison
router.get('/comparison/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { currentMonth, previousMonth, platform } = req.query;

    const platformFilter =
      platform && platform !== 'all'
        ? ` AND platform = $2`
        : '';

    const latestMonthParams =
      platform && platform !== 'all'
        ? [clientId, platform]
        : [clientId];

    let current;

    if (currentMonth) {
      current = new Date(currentMonth);
      current.setDate(1);
      current.setHours(0, 0, 0, 0);
    } else {
      const latestMonthResult = await db.query(
        `SELECT MAX(report_month) AS latest_month
         FROM performance_data
         WHERE client_id = $1
         AND external_campaign_name = 'aggregate'
         ${platformFilter}`,
        latestMonthParams
      );

      if (!latestMonthResult.rows[0]?.latest_month) {
        return res.json({
          currentMonth: null,
          previousMonth: null,
          comparison: {},
        });
      }

      current = new Date(latestMonthResult.rows[0].latest_month);
      current.setDate(1);
      current.setHours(0, 0, 0, 0);
    }

    let previous;

    if (previousMonth) {
      previous = new Date(previousMonth);
      previous.setDate(1);
      previous.setHours(0, 0, 0, 0);
    } else {
      const prevParams =
        platform && platform !== 'all'
          ? [clientId, current, platform]
          : [clientId, current];

      const prevPlatformFilter =
        platform && platform !== 'all'
          ? ` AND platform = $3`
          : '';

      const previousMonthResult = await db.query(
        `SELECT MAX(report_month) AS previous_month
         FROM performance_data
         WHERE client_id = $1
         AND external_campaign_name = 'aggregate'
         AND report_month < $2
         ${prevPlatformFilter}`,
        prevParams
      );

      previous = previousMonthResult.rows[0]?.previous_month
        ? new Date(previousMonthResult.rows[0].previous_month)
        : null;
    }

    const getMonthData = async (month) => {
      if (!month) {
        return {
          spend: 0,
          impressions: 0,
          clicks: 0,
          ctr: 0,
          cpc: 0,
          conversions: 0,
          cpa: 0,
          roas: 0,
          revenue: 0,
        };
      }

      let query = `
        SELECT
          SUM(COALESCE(spend, 0)) as spend,
          SUM(COALESCE(impressions, 0)) as impressions,
          SUM(COALESCE(clicks, 0)) as clicks,

          CASE
            WHEN SUM(COALESCE(impressions, 0)) > 0
            THEN SUM(COALESCE(clicks, 0))::float / SUM(COALESCE(impressions, 0)) * 100
            ELSE 0
          END as ctr,

          CASE
            WHEN SUM(COALESCE(clicks, 0)) > 0
            THEN SUM(COALESCE(spend, 0)) / SUM(COALESCE(clicks, 0))
            ELSE 0
          END as cpc,

          SUM(COALESCE(conversions, 0)) as conversions,

          CASE
            WHEN SUM(COALESCE(conversions, 0)) > 0
            THEN SUM(COALESCE(spend, 0)) / SUM(COALESCE(conversions, 0))
            ELSE 0
          END as cpa,

          CASE
            WHEN SUM(COALESCE(spend, 0)) > 0
            THEN SUM(COALESCE(revenue, 0)) / SUM(COALESCE(spend, 0))
            ELSE 0
          END as roas,

          SUM(COALESCE(revenue, 0)) as revenue
        FROM performance_data
        WHERE client_id = $1
        AND report_month = $2
        AND external_campaign_name = 'aggregate'
      `;

      const params = [clientId, month];

      if (platform && platform !== 'all') {
        query += ` AND platform = $3`;
        params.push(platform);
      }

      const result = await db.query(query, params);
      return result.rows[0] || {};
    };

    const [curr, prev] = await Promise.all([
      getMonthData(current),
      getMonthData(previous),
    ]);

    const calcChange = (currValue, prevValue) => {
      const currentNum = Number(currValue || 0);
      const previousNum = Number(prevValue || 0);

      if (previousNum === 0) {
        return null;
      }

      return ((currentNum - previousNum) / Math.abs(previousNum)) * 100;
    };

    const metrics = [
      'spend',
      'impressions',
      'clicks',
      'ctr',
      'cpc',
      'conversions',
      'cpa',
      'roas',
      'revenue',
    ];

    const comparison = {};

    metrics.forEach((metric) => {
      const currentValue = parseFloat(curr?.[metric]) || 0;
      const previousValue = parseFloat(prev?.[metric]) || 0;

      comparison[metric] = {
        current: currentValue,
        previous: previousValue,
        change: calcChange(currentValue, previousValue),
        hasPreviousData: previousValue !== 0,
      };
    });

    res.json({
      currentMonth: current ? current.toISOString() : null,
      previousMonth: previous ? previous.toISOString() : null,
      comparison,
    });
  } catch (error) {
    console.error('Comparison error:', error);
    res.status(500).json({ error: 'Failed to fetch comparison' });
  }
});

// Campaign breakdown
router.get('/campaigns/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { startDate, endDate, platform } = req.query;

    let whereClause = 'WHERE pd.client_id = $1 AND pd.campaign_id IS NOT NULL';
    const params = [clientId];
    let idx = 2;

    if (startDate) { whereClause += ` AND pd.report_month >= $${idx++}`; params.push(new Date(startDate)); }
    if (endDate) { whereClause += ` AND pd.report_month <= $${idx++}`; params.push(new Date(endDate)); }
    if (platform && platform !== 'all') { whereClause += ` AND pd.platform = $${idx++}`; params.push(platform); }

    const result = await db.query(
      `SELECT 
        c.name as campaign_name,
        pd.platform,
        SUM(pd.spend) as spend,
        SUM(pd.impressions) as impressions,
        SUM(pd.clicks) as clicks,
        CASE WHEN SUM(pd.impressions) > 0 THEN SUM(pd.clicks)::float / SUM(pd.impressions) * 100 ELSE 0 END as ctr,
        CASE WHEN SUM(pd.clicks) > 0 THEN SUM(pd.spend) / SUM(pd.clicks) ELSE 0 END as cpc,
        SUM(pd.conversions) as conversions,
        CASE WHEN SUM(pd.conversions) > 0 THEN SUM(pd.spend) / SUM(pd.conversions) ELSE 0 END as cpa,
        CASE WHEN SUM(pd.spend) > 0 THEN SUM(pd.revenue) / SUM(pd.spend) ELSE 0 END as roas
       FROM performance_data pd
       LEFT JOIN campaigns c ON pd.campaign_id = c.id
       ${whereClause}
       GROUP BY c.name, pd.platform
       HAVING SUM(pd.spend) > 1
       ORDER BY SUM(pd.spend) DESC
       LIMIT 20`,
      params
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch campaign data' });
  }
});

// Platform breakdown
router.get('/platforms/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { startDate, endDate } = req.query;

    let whereClause = `
      WHERE client_id = $1
      AND external_campaign_name = 'aggregate'
    `;

    const params = [clientId];
    let idx = 2;

    if (startDate) {
      whereClause += ` AND report_month >= $${idx++}`;
      params.push(new Date(startDate));
    }

    if (endDate) {
      whereClause += ` AND report_month <= $${idx++}`;
      params.push(new Date(endDate));
    }

    const result = await db.query(
      `SELECT
        platform,
        SUM(COALESCE(spend, 0)) as spend,
        SUM(COALESCE(impressions, 0)) as impressions,
        SUM(COALESCE(clicks, 0)) as clicks,
        SUM(COALESCE(conversions, 0)) as conversions,
        SUM(COALESCE(revenue, 0)) as revenue,

        CASE
          WHEN SUM(COALESCE(impressions, 0)) > 0
          THEN SUM(COALESCE(clicks, 0))::float / SUM(COALESCE(impressions, 0)) * 100
          ELSE 0
        END as ctr,

        CASE
          WHEN SUM(COALESCE(clicks, 0)) > 0
          THEN SUM(COALESCE(spend, 0)) / SUM(COALESCE(clicks, 0))
          ELSE 0
        END as cpc,

        CASE
          WHEN SUM(COALESCE(conversions, 0)) > 0
          THEN SUM(COALESCE(spend, 0)) / SUM(COALESCE(conversions, 0))
          ELSE 0
        END as cpa,

        CASE WHEN SUM(conversions) > 0
        THEN SUM(spend) / SUM(conversions)
        ELSE 0
        END as cpa,

        CASE
          WHEN SUM(COALESCE(spend, 0)) > 0
          THEN SUM(COALESCE(revenue, 0)) / SUM(COALESCE(spend, 0))
          ELSE 0
        END as roas
       FROM performance_data
       ${whereClause}
       GROUP BY platform
       HAVING SUM(COALESCE(spend, 0)) > 0
       ORDER BY SUM(COALESCE(spend, 0)) DESC`,
      params
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Platform data error:', error);
    res.status(500).json({ error: 'Failed to fetch platform data' });
  }
});

module.exports = router;
