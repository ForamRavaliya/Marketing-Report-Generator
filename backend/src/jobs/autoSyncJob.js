const cron = require('node-cron');
const db = require('../db');
const {
  fetchMetaInsights,
  normalizeMetaInsights,
} = require('../services/metaAdsService');

const syncAccount = async (account) => {
  let syncedRows = [];

  if (account.platform === 'meta' && account.access_token) {
    const rawInsights = await fetchMetaInsights({
      adAccountId: account.ad_account_id,
      accessToken: account.access_token,
    });

    syncedRows = normalizeMetaInsights(rawInsights);
  } else {
    syncedRows = [
      {
        campaignName: 'Auto Demo Synced Campaign',
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
       ON CONFLICT (client_id, name, platform)
       DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [account.client_id, row.campaignName, account.platform]
    );

    const campaignId = campaignResult.rows[0].id;

    await db.query(
      `INSERT INTO performance_data
       (client_id, campaign_id, platform, report_month, external_campaign_name,
        spend, reach, impressions, clicks, conversions, revenue)
       VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (client_id, platform, external_campaign_name, report_month)
       DO UPDATE SET
         spend = EXCLUDED.spend,
         reach = EXCLUDED.reach,
         impressions = EXCLUDED.impressions,
         clicks = EXCLUDED.clicks,
         conversions = EXCLUDED.conversions,
         revenue = EXCLUDED.revenue`,
      [
        account.client_id,
        campaignId,
        account.platform,
        row.campaignName,
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
     WHERE id = $1`,
    [account.id]
  );
};

const startAutoSyncJob = () => {
  // Runs every hour
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('⏱ Running auto sync job...');

      const result = await db.query(
        `SELECT *
         FROM ad_accounts
         WHERE sync_frequency IN ('daily', 'weekly')`
      );

      for (const account of result.rows) {
        const lastSynced = account.last_synced_at
          ? new Date(account.last_synced_at)
          : null;

        const now = new Date();
        const diffHours = lastSynced
          ? (now - lastSynced) / (1000 * 60 * 60)
          : Infinity;

        const shouldSync =
          account.sync_frequency === 'daily'
            ? diffHours >= 24
            : diffHours >= 168;

        if (shouldSync) {
          await syncAccount(account);
          console.log(`✅ Auto synced ${account.platform} account ${account.id}`);
        }
      }
    } catch (error) {
      console.error('Auto sync job error:', error.message);
    }
  });
};

module.exports = { startAutoSyncJob };