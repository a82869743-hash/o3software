const jwt = require('jsonwebtoken');
const pool = require('../config/db');

/**
 * protect — Verifies JWT from Authorization header or ?token= param.
 * Sets req.user = { id, role, name, mobile, franchise_id }
 * Automatically attaches multi-tenant isolation context:
 * - req.franchiseId
 * - req.isSuperAdmin
 * - req.isGlobalAdmin
 * - req.getFranchiseCondition(alias)
 */
const protect = async (req, res, next) => {
  // 1. Try Authorization header first
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 2. Fallback: ?token= query param (used for invoice PDF download in new tab)
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'No authentication token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Verify user is not deleted, deactivated, or logged out
    if (decoded.id && decoded.id > 0) {
      try {
        const [uRows] = await pool.query(
          'SELECT is_active, is_deleted, token_version FROM users WHERE id = ?',
          [decoded.id]
        );
        if (uRows.length > 0) {
          if (uRows[0].is_deleted === 1 || uRows[0].is_active === 0) {
            return res.status(401).json({ success: false, error: 'Account has been deactivated or deleted' });
          }
          if (decoded.token_version && decoded.token_version < uRows[0].token_version) {
            return res.status(401).json({ success: false, error: 'Session invalidated due to security update. Please log in again.' });
          }
        }
      } catch (dbErr) {
        // Non-blocking fallback
      }
    }

    const role = req.user.role;
    const userFranchiseId = req.user.franchise_id ? parseInt(req.user.franchise_id, 10) : 1;
    
    // Strict Super Admin: Only platform owner with role 'super_admin'
    // Franchise admins (even for franchise 1) NEVER get Super Admin access!
    const isSuperAdmin = (role === 'super_admin');
    req.isSuperAdmin = isSuperAdmin;

    // Impersonation detection
    if (decoded.is_impersonating) {
      req.isImpersonating = true;
      req.impersonatorId = decoded.impersonator_id;
    }

    const requestedHeaderFid = req.headers['x-franchise-id'] || req.query.franchise_id;

    if (isSuperAdmin) {
      if (requestedHeaderFid && (requestedHeaderFid === 'all' || requestedHeaderFid === '0')) {
        req.franchiseId = null;
        req.isGlobalAdmin = true;
      } else if (requestedHeaderFid) {
        req.franchiseId = parseInt(requestedHeaderFid, 10) || 1;
        req.isGlobalAdmin = false;
      } else {
        // Default Super Admin scope when no header passed is default franchise 1
        req.franchiseId = 1;
        req.isGlobalAdmin = false;
      }
    } else {
      // Branch admins, managers, staff, customers are strictly locked to their assigned franchise_id
      req.franchiseId = userFranchiseId;
      req.isGlobalAdmin = false;
    }

    req.getFranchiseCondition = (columnAlias = 'franchise_id') => {
      if (req.isGlobalAdmin) {
        return { clause: '', params: [] };
      }
      return {
        clause: ` AND ${columnAlias} = ?`,
        params: [req.franchiseId]
      };
    };

    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};

/**
 * optionalAuth — Parses token if present, but doesn't reject guest access.
 */
const optionalAuth = (req, res, next) => {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }
  if (!token && req.query.token) {
    token = req.query.token;
  }
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    } catch (e) {
      // ignore invalid token for optional auth
    }
  }
  next();
};

/**
 * authorize — Returns middleware that restricts access to specified roles.
 * Usage: authorize('admin') or authorize('admin', 'staff')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ success: false, error: 'Not authorized for this action' });
    }
    const userRole = req.user.role;
    // super_admin inherits all admin permissions
    if (userRole === 'super_admin' && (roles.includes('admin') || roles.includes('super_admin'))) {
      return next();
    }
    if (!roles.includes(userRole)) {
      return res.status(403).json({ success: false, error: 'Not authorized for this action' });
    }
    next();
  };
};

module.exports = protect;
module.exports.protect = protect;
module.exports.authorize = authorize;
module.exports.optionalAuth = optionalAuth;

