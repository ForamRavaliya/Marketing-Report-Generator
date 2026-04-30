const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'mysecretkey123';

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = header.split(' ')[1];

    const decoded = jwt.verify(token, JWT_SECRET);

    // ✅ FIX 1: REMOVE is_active condition
    const result = await db.query(
      'SELECT id, email, full_name, role, agency_id FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // ✅ FIX 2: MATCH your /me route
    req.user = {
      userId: result.rows[0].id,
        id: result.rows[0].id,
        email: result.rows[0].email,
        full_name: result.rows[0].full_name,
        role: result.rows[0].role,
        agency_id: result.rows[0].agency_id
    };

    next();

  } catch (error) {
    console.error("AUTH ERROR:", error.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = { authenticate, JWT_SECRET };