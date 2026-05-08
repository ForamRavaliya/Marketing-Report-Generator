const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const {
  fetchMetaInsights,
  normalizeMetaInsights,
} = require('../services/metaAdsService');

router.use(authenticate);

// Add / connect ad account
router.post('/', async (req, res) => {
  try {
    const { clientId, platform, adAccountId, accessToken } = req.body;

    if (!clientId || !platform || !adAccountId) {
      return res.status(400).json({
        error: 'clientId, platform and adAccountId are required',
      });
    }

    const result = await db.query(
      `INSERT INTO ad_accounts
       (client_id, agency_id, platform, ad_account_id, access_token)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        clientId,
        req.user.agency_id,
        platform,
        adAccountId,
        accessToken || null,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Add ad account error:', error);
    res.status(500).json({ error: 'Failed to add ad account' });
  }
});

// Get ad accounts by client
router.get('/client/:clientId', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, client_id, platform, ad_account_id, status, last_synced_at, created_at
       FROM ad_accounts
       WHERE client_id = $1 AND agency_id = $2
       ORDER BY created_at DESC`,
      [req.params.clientId, req.user.agency_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch ad accounts error:', error);
    res.status(500).json({ error: 'Failed to fetch ad accounts' });
  }
});

// Sync ad account data
router.post('/:id/sync', async (req, res) => {
  try {
    const accountResult = await db.query(
      `SELECT * FROM ad_accounts
       WHERE id = $1 AND agency_id = $2`,
      [req.params.id, req.user.agency_id]
    );

    const account = accountResult.rows[0];

    if (!account) {
      return res.status(404).json({ error: 'Ad account not found' });
    }

    let syncedRows = [];

    if (account.platform === 'meta' && account.access_token) {
      const rawInsights = await fetchMetaInsights({
        adAccountId: account.ad_account_id,
        accessToken: account.access_token,
      });

      syncedRows = normalizeMetaInsights(rawInsights);
    } else {
      // Demo fallback if real token not available
      syncedRows = [
        {
          campaignName: 'Demo Synced Campaign',
          spend: Math.floor(Math.random() * 3000) + 500,
          reach: Math.floor(Math.random() * 10000) + 2000,
          impressions: Math.floor(Math.random() * 15000) + 5000,
          clicks: Math.floor(Math.random() * 500) + 50,
          conversions: Math.floor(Math.random() * 50) + 5,
          revenue: Math.floor(Math.random() * 15000) + 3000,
        },
      ];
    }

    for (const row of syncedRows) {
      const campaignResult = await db.query(
        `INSERT INTO campaigns (client_id, name, platform)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [account.client_id, row.campaignName, account.platform]
      );

      const campaignId = campaignResult.rows[0].id;

      await db.query(
        `INSERT INTO performance_data
         (client_id, campaign_id, platform, report_month, spend, reach, impressions, clicks, conversions, revenue)
         VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, $8, $9)`,
        [
          account.client_id,
          campaignId,
          account.platform,
          row.spend,
          row.reach,
          row.impressions,
          row.clicks,
          row.conversions,
          row.revenue,
        ]
      );
    }

    await db.query(
      `UPDATE ad_accounts
       SET last_synced_at = CURRENT_TIMESTAMP,
           status = 'synced',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND agency_id = $2`,
      [req.params.id, req.user.agency_id]
    );

    res.json({
      message: 'Ad data synced successfully',
      platform: account.platform,
      adAccountId: account.ad_account_id,
      rowsSynced: syncedRows.length,
      mode: account.access_token ? 'live-api' : 'demo',
    });
  } catch (error) {
    console.error('Sync ad account error:', error.response?.data || error);
    res.status(500).json({
      error: 'Failed to sync ad account',
      details: error.response?.data?.error?.message || error.message,
    });
  }
});

// Delete ad account
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `DELETE FROM ad_accounts
       WHERE id = $1 AND agency_id = $2
       RETURNING id`,
      [req.params.id, req.user.agency_id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Ad account not found' });
    }

    res.json({ message: 'Ad account removed successfully' });
  } catch (error) {
    console.error('Delete ad account error:', error);
    res.status(500).json({ error: 'Failed to delete ad account' });
  }
});

module.exports = router;