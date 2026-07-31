require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { router: emailRoutes } = require('./routes/email');

const app = express();
const PORT = process.env.PORT || 5000;
const ENABLE_PLATFORM_SYNC = process.env.ENABLE_PLATFORM_SYNC === 'true';
const ENABLE_EMAIL_SCHEDULER = process.env.ENABLE_EMAIL_SCHEDULER === 'true';

// Ensure upload and output directories exist
['uploads', 'reports', 'logos'].forEach(dir => {
  const dirPath = path.join(__dirname, '../data', dir);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
});

// Middleware
app.use(cors({
  origin: true,
    credentials: true
  }));
app.options('*', cors());
// Razorpay webhook needs raw body, so keep this before express.json
app.use('/api/webhooks', require('./routes/webhooks'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/data', express.static(path.join(__dirname, '../data')));

app.use('/api/email', emailRoutes);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/performance', require('./routes/performance'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/ai-insights', require('./routes/aiInsights'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/agency', require('./routes/agency'));
//app.use('/api/ad-accounts', require('./routes/adAccounts'));
app.use('/api/integrations', require('./routes/integrations'));
app.use('/api/subscription', require('./routes/subscription'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/super-admin', require('./routes/superAdmin'));



const { startAutoSyncJob } = require('./jobs/autoSyncJob');
const { startSubscriptionExpiryJob } = require('./jobs/subscriptionExpiryJob');
const { startMonthlyEmailReportJob } = require('./jobs/monthlyEmailReportJob');
// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Return JSON for unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found'
  });
});

// Serve React frontend
const frontendBuildPath = path.join(__dirname, '../frontend-build');

app.use(express.static(frontendBuildPath));

// React Router fallback
app.get('*', (req, res, next) => {
  res.sendFile(path.join(frontendBuildPath, 'index.html'), err => {
    if (err) next(err);
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});
// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

app.listen(PORT, async () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  // Test DB connection
  try {
    const { pool } = require('./db');
    await pool.query('SELECT 1');
    console.log(`✅ PostgreSQL connected`);
    if (ENABLE_PLATFORM_SYNC) {
      startAutoSyncJob();
      console.log('⏱ Auto sync job started');
    } else {
      console.log('⏸ Auto sync job disabled');
    }

    startSubscriptionExpiryJob();
    if (ENABLE_EMAIL_SCHEDULER) {
      startMonthlyEmailReportJob();
      console.log('⏱ Monthly email report job started');
    } else {
      console.log('⏸ Monthly email report job disabled');
    }
    console.log('⏱ Subscription expiry job started');
  } catch (err) {
    console.error(`\n❌ PostgreSQL connection FAILED: ${err.message}`);
    console.error(`   Fix your backend/.env file:`);
    console.error(`   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD\n`);
  }
});

module.exports = app;
