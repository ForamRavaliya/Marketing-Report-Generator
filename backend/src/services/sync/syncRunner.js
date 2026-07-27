const db = require('../../db');
const { decryptToken, encryptToken } = require('./tokenCrypto');
const {
  fetchMetaInsights,
  normalizeMetaInsights,
} = require('./metaAdsSync');
const {
  fetchGoogleCampaignMetrics,
  normalizeGoogleAdsRows,
  refreshGoogleAccessToken,
} = require('./googleAdsSync');
const {
  fetchCampaignNames: fetchLinkedInCampaignNames,
  fetchLinkedInCampaignMetrics,
  normalizeLinkedInRows,
  refreshLinkedInAccessToken,
} = require('./linkedInAdsSync');
const {
  fetchShopifyOrders,
  normalizeShopifyOrders,
} = require('./shopifySync');
const {
  buildMonthlySummary,
  sanitizeImportedMetrics,
  safeNumber,
} = require('../../utils/metrics');

const planRules = {
  free: { autoSync: false, frequencies: [] },
  pro: { autoSync: true, frequencies: ['manual', 'daily'] },
  agency: { autoSync: true, frequencies: ['manual', 'daily', 'hourly'] },
};

const getAgencyPlan = async (agencyId) => {
  const result = await db.query(
    `SELECT plan_name, status
     FROM subscriptions
     WHERE agency_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [agencyId]
  );

  const row = result.rows[0];
  return row?.status === 'active' ? row.plan_name || 'free' : 'free';
};

const assertSyncAllowed = async (agencyId, frequency = 'manual') => {
  const plan = await getAgencyPlan(agencyId);
  const rules = planRules[plan] || planRules.free;

  if (!rules.autoSync) {
    const error = new Error('Auto Sync is not available on the Free plan.');
    error.status = 403;
    throw error;
  }

  if (!rules.frequencies.includes(frequency)) {
    const error = new Error(`The ${plan} plan does not allow ${frequency} sync.`);
    error.status = 403;
    throw error;
  }

  return { plan, rules };
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const dateOnly = (date) => date.toISOString().slice(0, 10);

const defaultDateRange = () => {
  const today = new Date();
  const from = addDays(today, -30);
  return {
    dateFrom: dateOnly(from),
    dateTo: dateOnly(today),
  };
};

const monthKey = (row) => row.report_month || dateOnly(new Date());

const upsertCampaign = async (client, row) => {
  const campaignResult = await client.query(
    `INSERT INTO campaigns (client_id, name, platform)
     VALUES ($1, $2, $3)
     ON CONFLICT (client_id, name, platform)
     DO UPDATE SET updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [row.client_id, row.campaignName, row.platform]
  );

  return campaignResult.rows[0].id;
};

const upsertPerformanceRow = async (client, row) => {
  await client.query(
    `INSERT INTO performance_data
     (
       client_id, campaign_id, platform, report_month,
       date_range_start, date_range_end, external_campaign_name,
       spend, reach, impressions, clicks, ctr, cpc, conversions, cpa,
       roas, revenue, raw_data, report_type, row_level, result_type, updated_at
     )
     VALUES
     ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,CURRENT_TIMESTAMP)
     ON CONFLICT (client_id, platform, external_campaign_name, report_month)
     DO UPDATE SET
       campaign_id = EXCLUDED.campaign_id,
       date_range_start = EXCLUDED.date_range_start,
       date_range_end = EXCLUDED.date_range_end,
       spend = EXCLUDED.spend,
       reach = EXCLUDED.reach,
       impressions = EXCLUDED.impressions,
       clicks = EXCLUDED.clicks,
       ctr = EXCLUDED.ctr,
       cpc = EXCLUDED.cpc,
       conversions = EXCLUDED.conversions,
       cpa = EXCLUDED.cpa,
       roas = EXCLUDED.roas,
       revenue = EXCLUDED.revenue,
       raw_data = EXCLUDED.raw_data,
       report_type = EXCLUDED.report_type,
       row_level = EXCLUDED.row_level,
       result_type = EXCLUDED.result_type,
       updated_at = CURRENT_TIMESTAMP`,
    [
      row.client_id,
      row.campaign_id || null,
      row.platform,
      row.report_month,
      row.date_range_start,
      row.date_range_end,
      row.external_campaign_name,
      row.spend,
      row.reach,
      row.impressions,
      row.clicks,
      row.ctr,
      row.cpc,
      row.conversions,
      row.cpa,
      row.roas,
      row.revenue,
      JSON.stringify(row.raw_data || {}),
      row.report_type,
      row.row_level || row.raw_data?.row_type || null,
      row.result_type || null,
    ]
  );
};

const reportTypeForRows = (rows) =>
  rows.some((row) => safeNumber(row.purchases, 0) > 0 || safeNumber(row.revenue, 0) > 0)
    ? 'sales_campaign'
    : 'lead_generation';

const importNormalizedRows = async ({ connection, rows }) => {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const grouped = new Map();
    for (const row of rows) {
      const key = monthKey(row);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    }

    let imported = 0;
    for (const [reportMonth, monthRows] of grouped.entries()) {
      const reportType = reportTypeForRows(monthRows);
      const summary = buildMonthlySummary(monthRows);
      const dateStart = monthRows.map((row) => row.date_range_start).filter(Boolean).sort()[0] || reportMonth;
      const dateEnd = monthRows.map((row) => row.date_range_end).filter(Boolean).sort().reverse()[0] || reportMonth;

      await upsertPerformanceRow(client, {
        ...summary,
        client_id: connection.client_id,
        platform: connection.platform,
        report_month: reportMonth,
        date_range_start: dateStart,
        date_range_end: dateEnd,
          external_campaign_name: 'aggregate',
          report_type: reportType,
          row_level: 'account',
          raw_data: {
          source: 'auto_sync',
          connection_id: connection.id,
          row_type: 'aggregate',
        },
      });
      imported += 1;

      for (const row of monthRows) {
        const campaignName = String(row.campaignName || '').trim();
        if (!campaignName || ['aggregate', 'total', 'overall', 'unknown campaign'].includes(campaignName.toLowerCase())) {
          continue;
        }

        const campaignId = await upsertCampaign(client, {
          client_id: connection.client_id,
          campaignName,
          platform: connection.platform,
        });

        const metrics = sanitizeImportedMetrics(row);
        await upsertPerformanceRow(client, {
          ...metrics,
          client_id: connection.client_id,
          campaign_id: campaignId,
          platform: connection.platform,
          report_month: row.report_month,
          date_range_start: row.date_range_start,
          date_range_end: row.date_range_end,
          external_campaign_name: campaignName,
          report_type: reportType,
          row_level: 'campaign',
          raw_data: {
            ...(row.raw_data || {}),
            source: 'auto_sync',
            connection_id: connection.id,
            row_type: 'campaign',
          },
        });
        imported += 1;
      }
    }

    await client.query('COMMIT');
    return imported;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const createLog = async ({ connection, syncType, dateFrom, dateTo }) => {
  const result = await db.query(
    `INSERT INTO sync_logs
     (agency_id, client_id, connection_id, integration_id, platform, sync_type, mode, date_from, date_to, started_at, status, message)
     VALUES ($1,$2,$3,$3,$4,$5,$5,$6,$7,NOW(),'running','Sync started')
     RETURNING *`,
    [
      connection.agency_id,
      connection.client_id,
      connection.id,
      connection.platform,
      syncType,
      dateFrom,
      dateTo,
    ]
  );

  return result.rows[0];
};

const finishLog = async ({ logId, status, rowsFetched, rowsImported, warnings = [], errorMessage = null }) => {
  await db.query(
    `UPDATE sync_logs
     SET finished_at = NOW(),
         completed_at = NOW(),
         status = $2,
         rows_fetched = $3,
         rows_imported = $4,
         rows_synced = $4,
         synced_campaigns = $4,
         warnings = $5,
         error_message = $6,
         message = $7
     WHERE id = $1`,
    [
      logId,
      status,
      rowsFetched,
      rowsImported,
      JSON.stringify(warnings),
      errorMessage,
      errorMessage || `Sync ${status}`,
    ]
  );
};

const runConnectionSync = async ({ connectionId, agencyId, syncType = 'manual', dateFrom, dateTo }) => {
  const connectionResult = await db.query(
    `SELECT *
     FROM platform_connections
     WHERE id = $1
     ${agencyId ? 'AND agency_id = $2' : ''}`,
    agencyId ? [connectionId, agencyId] : [connectionId]
  );

  const connection = connectionResult.rows[0];
  if (!connection) {
    const error = new Error('Platform connection not found.');
    error.status = 404;
    throw error;
  }

  await assertSyncAllowed(connection.agency_id, syncType === 'scheduled' ? connection.sync_frequency : 'manual');

  const range = {
    dateFrom: dateFrom || defaultDateRange().dateFrom,
    dateTo: dateTo || defaultDateRange().dateTo,
  };
  const log = await createLog({ connection, syncType, ...range });
  const warnings = [];

  try {
    if (connection.platform === 'meta' && connection.expires_at && new Date(connection.expires_at) <= new Date()) {
      const expiredError = new Error('Meta access token has expired. Please reconnect the integration.');
      expiredError.status = 401;
      throw expiredError;
    }

    let rawRows = [];
    let normalizedRows = [];

    if (connection.platform === 'meta') {
      const accessToken = decryptToken(connection.access_token_encrypted);
      rawRows = await fetchMetaInsights({
        accountId: connection.account_id,
        accessToken,
        ...range,
      });
      normalizedRows = normalizeMetaInsights(rawRows);
    } else if (connection.platform === 'google_ads') {
      let accessToken = decryptToken(connection.access_token_encrypted);

      if (connection.expires_at && new Date(connection.expires_at) <= new Date()) {
        const refreshToken = decryptToken(connection.refresh_token_encrypted);
        const refreshed = await refreshGoogleAccessToken(refreshToken);
        accessToken = refreshed.accessToken;

        await db.query(
          `UPDATE platform_connections
           SET access_token_encrypted = $2,
               expires_at = $3,
               updated_at = NOW()
           WHERE id = $1`,
          [
            connection.id,
            encryptToken(refreshed.accessToken),
            refreshed.expiresIn ? new Date(Date.now() + Number(refreshed.expiresIn) * 1000) : null,
          ]
        );
      }

      rawRows = await fetchGoogleCampaignMetrics({
        customerId: connection.account_id,
        accessToken,
        ...range,
      });
      normalizedRows = normalizeGoogleAdsRows(rawRows);
    } else if (connection.platform === 'linkedin_ads') {
      let accessToken = decryptToken(connection.access_token_encrypted);

      if (connection.expires_at && new Date(connection.expires_at) <= new Date()) {
        const refreshToken = decryptToken(connection.refresh_token_encrypted);
        const refreshed = await refreshLinkedInAccessToken(refreshToken);
        accessToken = refreshed.accessToken;

        await db.query(
          `UPDATE platform_connections
           SET access_token_encrypted = $2,
               refresh_token_encrypted = COALESCE($3, refresh_token_encrypted),
               expires_at = $4,
               updated_at = NOW()
           WHERE id = $1`,
          [
            connection.id,
            encryptToken(refreshed.accessToken),
            refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : null,
            refreshed.expiresIn ? new Date(Date.now() + Number(refreshed.expiresIn) * 1000) : null,
          ]
        );
      }

      const campaignNames = await fetchLinkedInCampaignNames({
        accountId: connection.account_id,
        accessToken,
      });
      rawRows = await fetchLinkedInCampaignMetrics({
        accountId: connection.account_id,
        accessToken,
        ...range,
      });
      normalizedRows = normalizeLinkedInRows(rawRows, campaignNames);
    } else if (connection.platform === 'shopify') {
      const accessToken = decryptToken(connection.access_token_encrypted);
      rawRows = await fetchShopifyOrders({
        shop: connection.account_id,
        accessToken,
        ...range,
      });
      normalizedRows = normalizeShopifyOrders(rawRows);
    } else {
      throw new Error(`${connection.platform} sync is not implemented yet.`);
    }

    const rowsImported = await importNormalizedRows({ connection, rows: normalizedRows });

    await finishLog({
      logId: log.id,
      status: warnings.length ? 'partial' : 'success',
      rowsFetched: rawRows.length,
      rowsImported,
      warnings,
    });

    await db.query(
      `UPDATE platform_connections
       SET last_sync_at = NOW(),
           last_success_at = NOW(),
           last_error = NULL,
           status = 'connected',
           updated_at = NOW()
       WHERE id = $1`,
      [connection.id]
    );

    return {
      status: warnings.length ? 'partial' : 'success',
      rowsFetched: rawRows.length,
      rowsImported,
      warnings,
    };
  } catch (error) {
    await finishLog({
      logId: log.id,
      status: 'failed',
      rowsFetched: 0,
      rowsImported: 0,
      warnings,
      errorMessage: error.message,
    });

    await db.query(
      `UPDATE platform_connections
       SET last_sync_at = NOW(),
           last_error = $2,
           status = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [connection.id, error.message, error.status === 401 ? 'expired' : 'failed']
    );

    throw error;
  }
};

const dueConnections = async () => {
  const result = await db.query(
    `SELECT pc.*
     FROM platform_connections pc
     WHERE pc.status = 'connected'
       AND pc.sync_frequency IN ('daily', 'hourly')
       AND (
         pc.last_sync_at IS NULL
         OR (pc.sync_frequency = 'hourly' AND pc.last_sync_at <= NOW() - INTERVAL '1 hour')
         OR (pc.sync_frequency = 'daily' AND pc.last_sync_at <= NOW() - INTERVAL '24 hours')
       )
     ORDER BY pc.last_sync_at NULLS FIRST`
  );

  return result.rows;
};

module.exports = {
  assertSyncAllowed,
  getAgencyPlan,
  runConnectionSync,
  dueConnections,
};
