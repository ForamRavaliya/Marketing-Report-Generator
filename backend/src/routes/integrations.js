const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../db');
const { authenticate, JWT_SECRET } = require('../middleware/auth');
const {
  buildMetaOAuthUrl,
  exchangeCodeForToken: exchangeMetaCodeForToken,
  fetchAdAccounts,
  assertConfigured: assertMetaConfigured,
} = require('../services/sync/metaAdsSync');
const {
  buildGoogleOAuthUrl,
  exchangeCodeForToken: exchangeGoogleCodeForToken,
  fetchAccessibleCustomers,
  fetchCustomerMetadata,
  assertConfigured: assertGoogleConfigured,
} = require('../services/sync/googleAdsSync');
const {
  buildLinkedInOAuthUrl,
  exchangeCodeForToken: exchangeLinkedInCodeForToken,
  fetchAdAccounts: fetchLinkedInAdAccounts,
  assertConfigured: assertLinkedInConfigured,
} = require('../services/sync/linkedInAdsSync');
const {
  buildShopifyOAuthUrl,
  exchangeCodeForToken: exchangeShopifyCodeForToken,
  normalizeShopDomain,
  verifyShopifyHmac,
  assertConfigured: assertShopifyConfigured,
} = require('../services/sync/shopifySync');
const { encryptToken } = require('../services/sync/tokenCrypto');
const {
  assertSyncAllowed,
  runConnectionSync,
} = require('../services/sync/syncRunner');

const ENABLE_PLATFORM_SYNC = process.env.ENABLE_PLATFORM_SYNC === 'true';
const platformSyncDisabled = (req, res) =>
  res.status(503).json({
    error: 'Platform sync integrations are temporarily disabled while data accuracy validation is in progress.',
  });

if (!ENABLE_PLATFORM_SYNC) {
  router.use(platformSyncDisabled);
}

const sanitizeConnection = (row) => {
  if (!row) return row;
  const {
    access_token_encrypted,
    refresh_token_encrypted,
    ...safe
  } = row;
  return safe;
};

const handleGoogleCallback = async (req, res) => {
  try {
    const { code, state, error, error_description: errorDescription } = req.query;

    if (error) {
      return res.status(400).send(errorDescription || error);
    }
    if (!code || !state) {
      return res.status(400).send('Google Ads OAuth callback is missing code or state.');
    }

    const payload = jwt.verify(String(state), JWT_SECRET);
    const { agencyId, clientId, userId } = payload;

    await assertSyncAllowed(agencyId, 'manual');

    const tokenResult = await exchangeGoogleCodeForToken(code);
    if (!tokenResult.refreshToken) {
      return res.status(400).send('Google Ads did not return a refresh token. Please reconnect and approve offline access.');
    }

    const accessibleCustomers = await fetchAccessibleCustomers(tokenResult.accessToken);
    const selectedCustomerId = accessibleCustomers[0];

    if (!selectedCustomerId) {
      return res.status(400).send('No Google Ads customer account was available for this user.');
    }

    const metadata = await fetchCustomerMetadata({
      customerId: selectedCustomerId,
      accessToken: tokenResult.accessToken,
    });
    const expiresAt = tokenResult.expiresIn
      ? new Date(Date.now() + Number(tokenResult.expiresIn) * 1000)
      : null;

    await db.query(
      `INSERT INTO platform_connections
       (
         agency_id, client_id, platform, account_id, account_name,
         access_token_encrypted, refresh_token_encrypted, expires_at,
         scope, status, sync_frequency, created_by, updated_at
       )
       VALUES ($1,$2,'google_ads',$3,$4,$5,$6,$7,$8,'connected','daily',$9,NOW())
       ON CONFLICT (agency_id, client_id, platform, account_id)
       DO UPDATE SET
         account_name = EXCLUDED.account_name,
         access_token_encrypted = EXCLUDED.access_token_encrypted,
         refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
         expires_at = EXCLUDED.expires_at,
         scope = EXCLUDED.scope,
         status = 'connected',
         last_error = NULL,
         updated_at = NOW()
       RETURNING id`,
      [
        agencyId,
        clientId,
        metadata.accountId,
        metadata.accountName,
        encryptToken(tokenResult.accessToken),
        encryptToken(tokenResult.refreshToken),
        expiresAt,
        tokenResult.scope,
        userId,
      ]
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/integrations?google=connected`);
  } catch (error) {
    console.error('Google Ads callback error:', error.message);
    res.status(500).send(error.message || 'Failed to connect Google Ads.');
  }
};

const handleLinkedInCallback = async (req, res) => {
  try {
    const { code, state, error, error_description: errorDescription } = req.query;

    if (error) {
      return res.status(400).send(errorDescription || error);
    }
    if (!code || !state) {
      return res.status(400).send('LinkedIn Ads OAuth callback is missing code or state.');
    }

    const payload = jwt.verify(String(state), JWT_SECRET);
    const { agencyId, clientId, userId } = payload;

    await assertSyncAllowed(agencyId, 'manual');

    const tokenResult = await exchangeLinkedInCodeForToken(code);
    const adAccounts = await fetchLinkedInAdAccounts(tokenResult.accessToken);
    const selectedAccount = adAccounts[0];

    if (!selectedAccount) {
      return res.status(400).send('No LinkedIn Ads account was available for this user.');
    }

    const accountId = String(selectedAccount.id || '').replace('urn:li:sponsoredAccount:', '');
    const expiresAt = tokenResult.expiresIn
      ? new Date(Date.now() + Number(tokenResult.expiresIn) * 1000)
      : null;

    await db.query(
      `INSERT INTO platform_connections
       (
         agency_id, client_id, platform, account_id, account_name,
         access_token_encrypted, refresh_token_encrypted, expires_at,
         scope, status, sync_frequency, created_by, updated_at
       )
       VALUES ($1,$2,'linkedin_ads',$3,$4,$5,$6,$7,$8,'connected','daily',$9,NOW())
       ON CONFLICT (agency_id, client_id, platform, account_id)
       DO UPDATE SET
         account_name = EXCLUDED.account_name,
         access_token_encrypted = EXCLUDED.access_token_encrypted,
         refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
         expires_at = EXCLUDED.expires_at,
         scope = EXCLUDED.scope,
         status = 'connected',
         last_error = NULL,
         updated_at = NOW()
       RETURNING id`,
      [
        agencyId,
        clientId,
        accountId,
        selectedAccount.name || `LinkedIn Ads ${accountId}`,
        encryptToken(tokenResult.accessToken),
        tokenResult.refreshToken ? encryptToken(tokenResult.refreshToken) : null,
        expiresAt,
        tokenResult.scope,
        userId,
      ]
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/integrations?linkedin=connected`);
  } catch (error) {
    console.error('LinkedIn Ads callback error:', error.message);
    res.status(500).send(error.message || 'Failed to connect LinkedIn Ads.');
  }
};

const handleShopifyCallback = async (req, res) => {
  try {
    const { code, state, shop, error, error_description: errorDescription } = req.query;

    if (error) {
      return res.status(400).send(errorDescription || error);
    }
    if (!code || !state || !shop) {
      return res.status(400).send('Shopify OAuth callback is missing code, state, or shop.');
    }
    if (!verifyShopifyHmac(req.query)) {
      return res.status(400).send('Invalid Shopify OAuth signature.');
    }

    const payload = jwt.verify(String(state), JWT_SECRET);
    const { agencyId, clientId, userId } = payload;

    await assertSyncAllowed(agencyId, 'manual');

    const tokenResult = await exchangeShopifyCodeForToken({ shop, code });
    const shopDomain = normalizeShopDomain(tokenResult.shopDomain || shop);

    await db.query(
      `INSERT INTO platform_connections
       (
         agency_id, client_id, platform, account_id, account_name,
         access_token_encrypted, refresh_token_encrypted, expires_at,
         scope, status, sync_frequency, created_by, updated_at
       )
       VALUES ($1,$2,'shopify',$3,$3,$4,NULL,NULL,$5,'connected','daily',$6,NOW())
       ON CONFLICT (agency_id, client_id, platform, account_id)
       DO UPDATE SET
         account_name = EXCLUDED.account_name,
         access_token_encrypted = EXCLUDED.access_token_encrypted,
         scope = EXCLUDED.scope,
         status = 'connected',
         last_error = NULL,
         updated_at = NOW()
       RETURNING id`,
      [
        agencyId,
        clientId,
        shopDomain,
        encryptToken(tokenResult.accessToken),
        tokenResult.scope,
        userId,
      ]
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/integrations?shopify=connected`);
  } catch (error) {
    console.error('Shopify callback error:', error.message);
    res.status(500).send(error.message || 'Failed to connect Shopify.');
  }
};

router.get('/meta/callback', async (req, res) => {
  try {
    const { code, state, error, error_description: errorDescription } = req.query;

    if (error) {
      return res.status(400).send(errorDescription || error);
    }
    if (!code || !state) {
      return res.status(400).send('Meta OAuth callback is missing code or state.');
    }

    const payload = jwt.verify(String(state), JWT_SECRET);
    const { agencyId, clientId, userId } = payload;

    await assertSyncAllowed(agencyId, 'manual');

    const tokenResult = await exchangeMetaCodeForToken(code);
    const adAccounts = await fetchAdAccounts(tokenResult.accessToken);
    const selectedAccount = adAccounts.find((account) => Number(account.account_status) === 1) || adAccounts[0];

    if (!selectedAccount) {
      return res.status(400).send('No Meta ad account was available for this user.');
    }

    const accountId = selectedAccount.account_id || String(selectedAccount.id || '').replace(/^act_/, '');
    const expiresAt = tokenResult.expiresIn
      ? new Date(Date.now() + Number(tokenResult.expiresIn) * 1000)
      : null;

    await db.query(
      `INSERT INTO platform_connections
       (
         agency_id, client_id, platform, account_id, account_name,
         access_token_encrypted, refresh_token_encrypted, expires_at,
         scope, status, sync_frequency, created_by, updated_at
       )
       VALUES ($1,$2,'meta',$3,$4,$5,NULL,$6,$7,'connected','daily',$8,NOW())
       ON CONFLICT (agency_id, client_id, platform, account_id)
       DO UPDATE SET
         account_name = EXCLUDED.account_name,
         access_token_encrypted = EXCLUDED.access_token_encrypted,
         expires_at = EXCLUDED.expires_at,
         scope = EXCLUDED.scope,
         status = 'connected',
         last_error = NULL,
         updated_at = NOW()
       RETURNING id`,
      [
        agencyId,
        clientId,
        accountId,
        selectedAccount.name || `Meta Ad Account ${accountId}`,
        encryptToken(tokenResult.accessToken),
        expiresAt,
        'ads_read,business_management,pages_read_engagement',
        userId,
      ]
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/integrations?meta=connected`);
  } catch (error) {
    console.error('Meta callback error:', error.message);
    res.status(500).send(error.message || 'Failed to connect Meta Ads.');
  }
});

router.get('/google/callback', handleGoogleCallback);
router.get('/linkedin/callback', handleLinkedInCallback);
router.get('/shopify/callback', handleShopifyCallback);

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const { clientId } = req.query;
    const params = [req.user.agency_id];
    const filters = ['agency_id = $1'];

    if (clientId) {
      params.push(clientId);
      filters.push(`client_id = $${params.length}`);
    }

    const result = await db.query(
      `SELECT *
       FROM platform_connections
       WHERE ${filters.join(' AND ')}
       ORDER BY created_at DESC`,
      params
    );

    res.json(result.rows.map(sanitizeConnection));
  } catch (error) {
    console.error('Fetch integrations error:', error);
    res.status(500).json({ error: 'Failed to fetch integrations' });
  }
});

router.post('/:clientId/meta/connect', async (req, res) => {
  try {
    const { clientId } = req.params;

    assertMetaConfigured();
    await assertSyncAllowed(req.user.agency_id, 'manual');

    const clientResult = await db.query(
      `SELECT id FROM clients WHERE id = $1 AND agency_id = $2 LIMIT 1`,
      [clientId, req.user.agency_id]
    );

    if (!clientResult.rows[0]) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const state = jwt.sign(
      {
        agencyId: req.user.agency_id,
        clientId,
        userId: req.user.id,
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({
      authUrl: buildMetaOAuthUrl({ state }),
    });
  } catch (error) {
    console.error('Start Meta connect error:', error.message);
    res.status(error.status || 500).json({ error: error.message || 'Failed to start Meta connection' });
  }
});

router.post('/:clientId/google/connect', async (req, res) => {
  try {
    const { clientId } = req.params;

    assertGoogleConfigured();
    await assertSyncAllowed(req.user.agency_id, 'manual');

    const clientResult = await db.query(
      `SELECT id FROM clients WHERE id = $1 AND agency_id = $2 LIMIT 1`,
      [clientId, req.user.agency_id]
    );

    if (!clientResult.rows[0]) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const state = jwt.sign(
      {
        agencyId: req.user.agency_id,
        clientId,
        userId: req.user.id,
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({
      authUrl: buildGoogleOAuthUrl({ state }),
    });
  } catch (error) {
    console.error('Start Google Ads connect error:', error.message);
    res.status(error.status || 500).json({ error: error.message || 'Failed to start Google Ads connection' });
  }
});

router.post('/:clientId/linkedin/connect', async (req, res) => {
  try {
    const { clientId } = req.params;

    assertLinkedInConfigured();
    await assertSyncAllowed(req.user.agency_id, 'manual');

    const clientResult = await db.query(
      `SELECT id FROM clients WHERE id = $1 AND agency_id = $2 LIMIT 1`,
      [clientId, req.user.agency_id]
    );

    if (!clientResult.rows[0]) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const state = jwt.sign(
      {
        agencyId: req.user.agency_id,
        clientId,
        userId: req.user.id,
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({
      authUrl: buildLinkedInOAuthUrl({ state }),
    });
  } catch (error) {
    console.error('Start LinkedIn Ads connect error:', error.message);
    res.status(error.status || 500).json({ error: error.message || 'Failed to start LinkedIn Ads connection' });
  }
});

router.post('/:clientId/shopify/connect', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { shop } = req.body || {};

    assertShopifyConfigured();
    await assertSyncAllowed(req.user.agency_id, 'manual');

    const clientResult = await db.query(
      `SELECT id FROM clients WHERE id = $1 AND agency_id = $2 LIMIT 1`,
      [clientId, req.user.agency_id]
    );

    if (!clientResult.rows[0]) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const state = jwt.sign(
      {
        agencyId: req.user.agency_id,
        clientId,
        userId: req.user.id,
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    const { authUrl } = buildShopifyOAuthUrl({ shop, state });
    res.json({ authUrl });
  } catch (error) {
    console.error('Start Shopify connect error:', error.message);
    res.status(error.status || 500).json({ error: error.message || 'Failed to start Shopify connection' });
  }
});

router.post('/:connectionId/sync', async (req, res) => {
  try {
    const { connectionId } = req.params;
    const result = await runConnectionSync({
      connectionId,
      agencyId: req.user.agency_id,
      syncType: 'manual',
      dateFrom: req.body?.dateFrom,
      dateTo: req.body?.dateTo,
    });

    res.json({
      message: 'Sync completed',
      ...result,
    });
  } catch (error) {
    console.error('Manual integration sync error:', error.message);
    res.status(error.status || 500).json({ error: error.message || 'Failed to sync integration' });
  }
});

router.delete('/:connectionId', async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE platform_connections
       SET status = 'disconnected',
           access_token_encrypted = NULL,
           refresh_token_encrypted = NULL,
           updated_at = NOW()
       WHERE id = $1 AND agency_id = $2
       RETURNING *`,
      [req.params.connectionId, req.user.agency_id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Platform connection not found' });
    }

    res.json(sanitizeConnection(result.rows[0]));
  } catch (error) {
    console.error('Disconnect integration error:', error);
    res.status(500).json({ error: 'Failed to disconnect integration' });
  }
});

router.get('/:connectionId/logs', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT sl.*
       FROM sync_logs sl
       JOIN platform_connections pc ON pc.id = sl.connection_id
       WHERE sl.connection_id = $1
         AND sl.agency_id = $2
         AND pc.agency_id = $2
       ORDER BY sl.created_at DESC
       LIMIT 50`,
      [req.params.connectionId, req.user.agency_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch sync logs error:', error);
    res.status(500).json({ error: 'Failed to fetch sync logs' });
  }
});

module.exports = router;
