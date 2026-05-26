const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET all integrations
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT *
       FROM platform_integrations
       WHERE agency_id = $1
       ORDER BY created_at DESC`,
      [req.user.agency_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch integrations error:', error);
    res.status(500).json({ error: 'Failed to fetch integrations' });
  }
});

// Demo connect platform
router.post('/demo-connect', async (req, res) => {
  try {
    const { clientId, platform } = req.body;

    if (!clientId || !platform) {
      return res.status(400).json({ error: 'clientId and platform required' });
    }

    const accountName =
      platform === 'meta'
        ? 'Demo Meta Ads Account'
        : platform === 'google'
        ? 'Demo Google Ads Account'
        : 'Demo Analytics Account';

    const result = await db.query(
      `INSERT INTO platform_integrations
       (agency_id, client_id, platform, account_name, account_id, status, last_synced_at)
       VALUES ($1, $2, $3, $4, $5, 'connected', NOW())
       RETURNING *`,
      [
        req.user.agency_id,
        clientId,
        platform,
        accountName,
        `demo_${platform}_${Date.now()}`,
      ]
    );

    res.json({
      message: `${accountName} connected successfully`,
      integration: result.rows[0],
    });
  } catch (error) {
    console.error('Demo connect error:', error);
    res.status(500).json({ error: 'Failed to connect platform' });
  }
});

// Sync integration
router.post('/:id/sync', async (req, res) => {
  try {
    const { id } = req.params;

    const integrationResult = await db.query(
      `SELECT *
       FROM platform_integrations
       WHERE id = $1 AND agency_id = $2`,
      [id, req.user.agency_id]
    );

    const integration = integrationResult.rows[0];

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const campaignsSynced = Math.floor(Math.random() * 8) + 5;

    await db.query(
      `UPDATE platform_integrations
       SET last_synced_at = NOW(), status = 'connected'
       WHERE id = $1`,
      [id]
    );

    await db.query(
      `INSERT INTO sync_logs
       (integration_id, agency_id, client_id, platform, mode, status, message, rows_synced, synced_campaigns, completed_at)
       VALUES ($1, $2, $3, $4, 'manual', 'success', $5, $6, $6, NOW())`,
      [
        id,
        req.user.agency_id,
        integration.client_id,
        integration.platform,
        `${integration.platform.toUpperCase()} synced successfully`,
        campaignsSynced,
      ]
    );

    res.json({
      message: 'Sync completed successfully',
      campaignsSynced,
      lastSyncedAt: new Date(),
    });
  } catch (error) {
    console.error('Sync integration error:', error);
    res.status(500).json({ error: 'Failed to sync integration' });
  }
});

// Get sync logs
router.get('/logs', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT *
       FROM sync_logs
       WHERE agency_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [req.user.agency_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch sync logs error:', error);
    res.status(500).json({ error: 'Failed to fetch sync logs' });
  }
});

module.exports = router;