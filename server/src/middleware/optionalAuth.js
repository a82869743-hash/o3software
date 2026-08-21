const jwt = require('jsonwebtoken');

/**
 * optionalAuth — Tries to decode JWT from Authorization header.
 * If valid, sets req.user = decoded payload.
 * If missing or invalid, sets req.user = null and continues (no rejection).
 *
 * Use this on routes that need to behave differently for authenticated
 * vs unauthenticated users (e.g. role-based filtering on GET /packages).
 */
const optionalAuth = (req, res, next) => {
  req.user = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    } catch {
      // Token invalid/expired — treat as unauthenticated (no error)
    }
  }

  next();
};

module.exports = optionalAuth;
