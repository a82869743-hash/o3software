const pool = require('../config/db');

/**
 * permissionsMiddleware — Checks if the staff user's custom role has the required permission.
 * Super roles (admin, super_admin) automatically bypass this check.
 * Usage: router.get('/something', auth, checkPermission('bookings.view'), ctrl.something)
 */
const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    // Admin & Super Admin bypass all permissions checks
    if (req.user.role === 'admin' || req.user.role === 'super_admin') {
      return next();
    }

    try {
      // 1. Fetch user's custom role
      const [users] = await pool.query('SELECT custom_role_id FROM users WHERE id = ?', [req.user.id]);
      if (!users.length) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const roleId = users[0].custom_role_id;
      if (!roleId) {
        return res.status(403).json({ success: false, error: `Access denied — missing permission: ${requiredPermission}` });
      }

      // 2. Fetch role permissions matching the requested action
      const [permRows] = await pool.query(
        `SELECT p.id
         FROM v2_role_permissions rp
         JOIN v2_permissions p ON rp.permission_id = p.id
         WHERE rp.role_id = ? AND p.permission_key = ?`,
        [roleId, requiredPermission]
      );

      if (!permRows.length) {
        return res.status(403).json({ success: false, error: `Access denied — missing permission: ${requiredPermission}` });
      }

      next();
    } catch (err) {
      console.error('Permissions middleware error:', err);
      res.status(500).json({ success: false, error: 'Internal server error during permission check' });
    }
  };
};

module.exports = checkPermission;
