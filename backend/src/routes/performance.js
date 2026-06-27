const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const {
  getSummaryMetrics,
    getMonthlyTrends,
    getPlatformMetrics,
    getCampaignMetrics,
    getLatestReportMonth,
    getPreviousReportMonth,

} = require('../utils/metrics');

router.use(authenticate);

// Get performance summary for a client
router.get('/summary/:clientId', async (req, res) => {
   try {
     const { clientId } = req.params;
     const { startDate, endDate, platform } = req.query;

     const summary = await getSummaryMetrics(db, {
       clientId,
       dateStart: startDate,
       dateEnd: endDate,
       platform,
     });

     res.json({
       spend: parseFloat(summary.spend) || 0,
       reach: parseFloat(summary.reach) || 0,
       impressions: parseFloat(summary.impressions) || 0,
       clicks: parseFloat(summary.clicks) || 0,
       conversions: parseFloat(summary.conversions) || 0,
       ctr: parseFloat(summary.ctr) || 0,
       cpc: parseFloat(summary.cpc) || 0,
       cpa: parseFloat(summary.cpa) || 0,
       roas: parseFloat(summary.roas) || 0,
       revenue: parseFloat(summary.revenue) || 0,
       dataPoints: 1,
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
    const { platform } = req.query;

    const trends = await getMonthlyTrends(db, {
      clientId,
      platform,
    });

    res.json(trends);
  } catch (error) {
    console.error('Trends error:', error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// Month-over-month comparison
router.get('/comparison/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;

    const { currentMonth, previousMonth, platform } = req.query;

    const baseOptions = {
      clientId,
      platform,
    };

    let current = currentMonth ? new Date(currentMonth) : null;
    if (current) {
      current.setDate(1);
      current.setHours(0, 0, 0, 0);
    }

    if (!current) {
      const latest = await getLatestReportMonth(db, baseOptions);

      if (!latest) {
        return res.json({
          currentMonth: null,
          previousMonth: null,
          comparison: {},
        });
      }

      current = new Date(latest);
      current.setDate(1);
      current.setHours(0, 0, 0, 0);
    }

    let previous = previousMonth ? new Date(previousMonth) : null;
    if (previous) {
      previous.setDate(1);
      previous.setHours(0, 0, 0, 0);
    }

    if (!previous) {
      const prev = await getPreviousReportMonth(db, baseOptions, current);
      previous = prev ? new Date(prev) : null;
    }

    const monthRange = (month) => {
      if (!month) return null;

      const start = new Date(month);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);

      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);

      return {
        dateStart: start.toISOString().slice(0, 10),
        dateEnd: end.toISOString().slice(0, 10),
      };
    };

    const currentRange = monthRange(current);
    const previousRange = monthRange(previous);

    const emptyMetrics = {
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

    const [curr, prev] = await Promise.all([
      getSummaryMetrics(db, {
        clientId,
        platform,
        dateStart: currentRange.dateStart,
        dateEnd: currentRange.dateEnd,
      }),
      previousRange
        ? getSummaryMetrics(db, {
            clientId,
            platform,
            dateStart: previousRange.dateStart,
            dateEnd: previousRange.dateEnd,
          })
        : Promise.resolve(emptyMetrics),
    ]);

    const calcChange = (currValue, prevValue) => {
      const currentNum = Number(currValue || 0);
      const previousNum = Number(prevValue || 0);

      if (previousNum === 0) return null;

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

    const campaigns = await getCampaignMetrics(db, {
      clientId,
      dateStart: startDate,
      dateEnd: endDate,
      platform,
    });

    res.json(campaigns);
  } catch (error) {
    console.error('Campaign data error:', error);
    res.status(500).json({ error: 'Failed to fetch campaign data' });
  }
});

// Platform breakdown
router.get('/platforms/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { startDate, endDate, platform } = req.query;

    const platforms = await getPlatformMetrics(db, {
      clientId,
      dateStart: startDate,
      dateEnd: endDate,
      platform,
    });

    res.json(platforms);
  } catch (error) {
    console.error('Platform data error:', error);
    res.status(500).json({ error: 'Failed to fetch platform data' });
  }
});

module.exports = router;
