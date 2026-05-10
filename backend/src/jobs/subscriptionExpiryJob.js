const cron = require('node-cron');
const db = require('../db');

const startSubscriptionExpiryJob = () => {
  // Runs every day at midnight
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('⏱ Checking expired subscriptions...');

      await db.query(
        `UPDATE subscriptions
         SET
           plan_name = 'free',
           status = 'expired',
           updated_at = CURRENT_TIMESTAMP
         WHERE
           expires_at IS NOT NULL
           AND expires_at < CURRENT_TIMESTAMP
           AND plan_name != 'free'`
      );

      console.log('✅ Expired subscriptions downgraded');
    } catch (error) {
      console.error(
        'Subscription expiry job error:',
        error.message
      );
    }
  });
};

module.exports = { startSubscriptionExpiryJob };