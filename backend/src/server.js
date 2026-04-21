require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure upload and output directories exist
['uploads', 'reports', 'logos'].forEach(dir => {
  const dirPath = path.join(__dirname, '../data', dir);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/data', express.static(path.join(__dirname, '../data')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/performance', require('./routes/performance'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/agency', require('./routes/agency'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
  } catch (err) {
    console.error(`\n❌ PostgreSQL connection FAILED: ${err.message}`);
    console.error(`   Fix your backend/.env file:`);
    console.error(`   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD\n`);
  }
});

module.exports = app;
