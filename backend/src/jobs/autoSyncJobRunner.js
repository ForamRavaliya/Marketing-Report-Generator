const cron = require('node-cron');
const {
  dueConnections,
  runConnectionSync,
} = require('../services/sync/syncRunner');

const startAutoSyncJob = () => {
  if (process.env.ENABLE_PLATFORM_SYNC !== 'true') {
    console.log('Auto sync job skipped because ENABLE_PLATFORM_SYNC is not true.');
    return null;
  }

  cron.schedule('0 * * * *', async () => {
    try {
      console.log('Running auto sync job...');

      const connections = await dueConnections();

      for (const connection of connections) {
        try {
          await runConnectionSync({
            connectionId: connection.id,
            syncType: 'scheduled',
          });
          console.log(`Auto synced ${connection.platform} connection ${connection.id}`);
        } catch (error) {
          console.error(`Auto sync failed for connection ${connection.id}:`, error.message);
        }
      }
    } catch (error) {
      console.error('Auto sync job error:', error.message);
    }
  });
};

module.exports = { startAutoSyncJob };
