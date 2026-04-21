const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const result = await db.query(
      `SELECT u.*, a.name as agency_name, a.logo_url, a.primary_color, a.secondary_color 
       FROM users u 
       LEFT JOIN agencies a ON u.agency_id = a.id 
       WHERE u.email = $1 AND u.is_active = TRUE`,
      [email.toLowerCase()]
    );

    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        agencyId: user.agency_id,
        agencyName: user.agency_name,
        logoUrl: user.logo_url,
        primaryColor: user.primary_color,
        secondaryColor: user.secondary_color,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, agencyName } = req.body;

    if (!email || !password || !fullName || !agencyName) {
      return res.status(400).json({ error: 'All fields are required: email, password, fullName, agencyName' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length) return res.status(409).json({ error: 'An account with this email already exists' });

    // Create agency first
    const agencyResult = await db.query(
      `INSERT INTO agencies (name, primary_color, secondary_color)
       VALUES ($1, '#2563EB', '#7C3AED') RETURNING *`,
      [agencyName.trim()]
    );
    const agency = agencyResult.rows[0];

    // Create user
    const hash = await bcrypt.hash(password, 10);
    const userResult = await db.query(
      `INSERT INTO users (agency_id, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, 'admin') RETURNING *`,
      [agency.id, email.toLowerCase().trim(), hash, fullName.trim()]
    );
    const user = userResult.rows[0];

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        agencyId: agency.id,
        agencyName: agency.name,
        primaryColor: agency.primary_color,
        secondaryColor: agency.secondary_color,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed: ' + error.message });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  const result = await db.query(
    `SELECT u.*, a.name as agency_name, a.logo_url, a.primary_color, a.secondary_color 
     FROM users u LEFT JOIN agencies a ON u.agency_id = a.id WHERE u.id = $1`,
    [req.user.id]
  );
  const user = result.rows[0];
  res.json({
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    agencyId: user.agency_id,
    agencyName: user.agency_name,
    logoUrl: user.logo_url,
    primaryColor: user.primary_color,
    secondaryColor: user.secondary_color,
  });
});

module.exports = router;
