const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { enforceModuleAccess } = require('./accessControl');

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
  if (!token && req.query.token && req.method === 'GET') {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'No authentication token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Verify user is not deleted, deactivated, or logged out — and take role/franchise from the DB,
    // never trusting a stale token for authorization data.
    if (decoded.id && decoded.id > 0) {
      const [uRows] = await pool.query(
        `SELECT u.is_active, u.is_deleted, u.token_version, u.role, u.franchise_id, u.custom_role_id,
                f.is_active AS studio_active, f.is_deleted AS studio_deleted
         FROM users u LEFT JOIN franchises f ON f.id = COALESCE(u.franchise_id, 1) WHERE u.id = ?`,
        [decoded.id]
      );
      if (!uRows.length) {
        return res.status(401).json({ success: false, error: 'Account no longer exists' });
      }
      const dbUser = uRows[0];
      if (dbUser.is_deleted === 1 || dbUser.is_active === 0) {
        return res.status(401).json({ success: false, error: 'Account has been deactivated or deleted' });
      }
      if (!decoded.token_version || decoded.token_version < dbUser.token_version) {
        return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
      }
      // a removed or switched-off studio: its team can no longer use the app (Super Admin "open as studio" still can)
      if (!decoded.is_impersonating && !['super_admin', 'customer'].includes(dbUser.role)
        && (dbUser.studio_deleted === 1 || dbUser.studio_active === 0 || dbUser.studio_active === null)) {
        return res.status(403).json({ success: false, error: 'This studio is closed. Please contact the main office.' });
      }
      if (!decoded.is_impersonating) {
        req.user.role = dbUser.role;
        req.user.franchise_id = dbUser.franchise_id || 1;
      }
      req.user.custom_role_id = dbUser.custom_role_id || null;
    } else if (!decoded.is_impersonating) {
      return res.status(401).json({ success: false, error: 'Invalid session' });
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
      // Branch admins, managers, staff, customers are strictly locked to their assigned franchise_id.
      // Overwrite any client-supplied franchise selector so no controller can be tricked into another franchise.
      req.franchiseId = userFranchiseId;
      req.isGlobalAdmin = false;
      req.headers['x-franchise-id'] = String(userFranchiseId);
      if (req.query && req.query.franchise_id !== undefined) req.query.franchise_id = String(userFranchiseId);
      if (req.body && typeof req.body === 'object' && req.body.franchise_id !== undefined) req.body.franchise_id = userFranchiseId;
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

  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  // Central module/action permission enforcement (Super Admin → franchise → role)
  return enforceModuleAccess(req, res, next);
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
    // Internal users cleared by the central permission matrix for this module/action
    if (req.rbacGranted && ['admin', 'manager', 'staff'].includes(userRole) && !roles.every(r => r === 'customer')) {
      return next();
    }
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

