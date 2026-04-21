const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await db.query(
      'SELECT id, email, full_name, role, agency_id FROM users WHERE id = $1 AND is_active = TRUE',
      [decoded.userId]
    );

    if (!result.rows.length) return res.status(401).json({ error: 'Invalid token' });
    req.user = result.rows[0];
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

module.exports = { authenticate, authorize, JWT_SECRET };
