const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    'JWT_SECRET environment variable is required. Refusing to start with an insecure default secret.'
  );
}

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
      `SELECT
         u.id, u.email, u.full_name, u.role, u.agency_id,
         COALESCE(a.is_active, TRUE) AS agency_active
       FROM users u
       LEFT JOIN agencies a ON a.id = u.agency_id
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: 'Invalid token' });
    }

const user = result.rows[0];

if (user.role !== 'super_admin' && user.agency_active === false) {
  return res.status(403).json({
    error: 'Your agency account has been suspended. Please contact support.',
  });
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

const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  next();
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
};

module.exports = { authenticate, requireSuperAdmin, requireAdmin, JWT_SECRET };