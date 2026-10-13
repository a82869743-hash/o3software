/**
 * permissions.js — Strict Multi-Tenant Feature Entitlement & RBAC Enforcement Middleware
 *
 * Implements the core access equation:
 * Effective Access = (Features allowed to the Franchise by Super Admin)
 *                    ∩ (Features/Actions granted to the Employee/Role by Franchise Admin)
 */

const pool = require('../config/db');

// In-memory cache for franchise entitlements (15 second TTL, flushed on update)
const entitlementCache = new Map();
const cacheTtlMs = 15000;

function clearEntitlementCache(franchiseId) {
  if (franchiseId) {
    entitlementCache.delete(Number(franchiseId));
  } else {
    entitlementCache.clear();
  }
}

/**
 * Fetch active entitlements for a given franchise
 */
async function getFranchiseEntitlements(franchiseId) {
  const fid = Number(franchiseId) || 1;
  const now = Date.now();
  const cached = entitlementCache.get(fid);
  if (cached && (now - cached.timestamp < cacheTtlMs)) {
    return cached.data;
  }

  const [rows] = await pool.query(
    'SELECT feature_key, actions_json, is_enabled FROM franchise_entitlements WHERE franchise_id = ?',
    [fid]
  );

  const entMap = {};
  for (const r of rows) {
    let actions = [];
    try {
      actions = typeof r.actions_json === 'string' ? JSON.parse(r.actions_json) : r.actions_json;
    } catch {
      actions = [];
    }
    entMap[r.feature_key] = {
      is_enabled: r.is_enabled === 1,
      actions: Array.isArray(actions) ? actions : []
    };
  }

  entitlementCache.set(fid, { timestamp: now, data: entMap });
  return entMap;
}

/**
 * requireEntitlement(featureKey)
 * Enforces that the franchise has the module/feature enabled.
 */
function requireEntitlement(featureKey) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Super Admin platform owner bypasses franchise entitlement checks
    if (req.user.role === 'super_admin') {
      return next();
    }

    const fid = req.user.franchise_id || 1;
    const entitlements = await getFranchiseEntitlements(fid);
    const feature = entitlements[featureKey];

    if (!feature || !feature.is_enabled) {
      return res.status(403).json({
        success: false,
        error: `Feature "${featureKey}" is disabled for this franchise. Please contact Super Admin to enable it.`
      });
    }

    next();
  };
}

/**
 * requirePermission(permissionKey)
 * permissionKey format: "module.action" (e.g. "job_cards.create", "billing.view")
 *
 * Checks BOTH:
 * 1. Franchise has module enabled AND action permitted
 * 2. User (or user's role) has permission granted
 */
function requirePermission(permissionKey) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const userRole = req.user.role;

    // Super Admin has unrestricted access to all features & actions
    if (userRole === 'super_admin') {
      return next();
    }

    const [featureKey, action] = permissionKey.split('.');
    const fid = req.user.franchise_id || 1;

    // 1. Check Franchise Entitlement Ceiling
    const entitlements = await getFranchiseEntitlements(fid);
    const feature = entitlements[featureKey];

    if (!feature || !feature.is_enabled) {
      return res.status(403).json({
        success: false,
        error: `Access Denied: Feature "${featureKey}" is not enabled for your franchise.`
      });
    }

    if (action && Array.isArray(feature.actions) && feature.actions.length > 0 && !feature.actions.includes(action)) {
      return res.status(403).json({
        success: false,
        error: `Access Denied: Action "${action}" on "${featureKey}" is restricted by franchise plan.`
      });
    }

    // 2. Check User / Role Permissions
    // Franchise Admin (Owner) has all permissions within their franchise entitlement ceiling
    if (userRole === 'admin') {
      return next();
    }

    // For employees (manager, staff, or custom roles), verify assigned permissions
    try {
      // Check direct JSON permissions on user record if any
      if (req.user.permissions && Array.isArray(req.user.permissions)) {
        if (req.user.permissions.includes(permissionKey) || req.user.permissions.includes(`${featureKey}.*`)) {
          return next();
        }
      }

      // Check role permissions in database
      const [rolePerms] = await pool.query(`
        SELECT p.permission_key
        FROM v2_role_permissions rp
        JOIN v2_permissions p ON rp.permission_id = p.id
        JOIN v2_roles r ON rp.role_id = r.id
        WHERE (r.role_name = ? OR r.id = ?)
          AND (r.franchise_id = ? OR r.franchise_id IS NULL)
          AND p.permission_key IN (?, ?)
      `, [userRole, req.user.custom_role_id || 0, fid, permissionKey, `${featureKey}.*`]);

      if (rolePerms.length > 0) {
        return next();
      }

      // Fallback for default staff / manager role hierarchies on common viewing actions
      if (action === 'view') {
        const [isStaffViewable] = await pool.query(
          'SELECT 1 FROM v2_role_permissions rp JOIN v2_permissions p ON rp.permission_id = p.id WHERE p.permission_key = ? AND rp.role_id IN (3, 4)',
          [permissionKey]
        );
        if (isStaffViewable.length > 0 && ['manager', 'staff'].includes(userRole)) {
          return next();
        }
      }

      return res.status(403).json({
        success: false,
        error: `Access Denied: You do not have permission "${permissionKey}". Contact your Studio Admin.`
      });
    } catch (err) {
      console.error('Permission check error:', err);
      return res.status(500).json({ success: false, error: 'Internal authorization error' });
    }
  };
}

module.exports = {
  requireEntitlement,
  requirePermission,
  clearEntitlementCache,
  getFranchiseEntitlements
};
