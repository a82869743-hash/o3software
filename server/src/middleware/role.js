/**
 * roleMiddleware — Enforces Role/Permission Hierarchy:
 * Super Admin (50) > Franchise Admin (40) > Manager (30) > Staff/Technician (20) > Customer (10)
 *
 * Usage:
 *   role(['admin'])                -> Super Admin & Franchise Admin allowed; Manager, Staff, Customer denied (403)
 *   role(['manager'])              -> Super Admin, Admin, Manager allowed; Staff, Customer denied (403)
 *   role(['staff'])                -> Super Admin, Admin, Manager, Staff allowed; Customer denied (403)
 *   role(['customer'])             -> Customer allowed (or explicitly matching roles)
 *   role(['admin', 'customer'])    -> Admin, Super Admin, Customer allowed
 */

const ROLE_LEVELS = {
  super_admin: 50,
  admin: 40,
  manager: 30,
  staff: 20,
  customer: 10,
};

const roleMiddleware = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const userRole = req.user.role;

    // 1. Super Admin has unrestricted access to all internal operations
    if (userRole === 'super_admin') {
      return next();
    }

    // 2. Direct exact role match
    if (allowedRoles.includes(userRole)) {
      return next();
    }

    // 3. Hierarchical Inheritance for internal operational roles:
    // If the endpoint is accessible to a given staff/manager level, higher management inherits access.
    const internalAllowedRoles = allowedRoles.filter(r => ['admin', 'manager', 'staff'].includes(r));
    if (internalAllowedRoles.length > 0 && ['admin', 'manager', 'staff'].includes(userRole)) {
      const minRequiredLevel = Math.min(...internalAllowedRoles.map(r => ROLE_LEVELS[r]));
      const userLevel = ROLE_LEVELS[userRole] || 0;
      if (userLevel >= minRequiredLevel) {
        return next();
      }
    }

    return res.status(403).json({
      success: false,
      error: `Access denied — insufficient permissions for role "${userRole}"`
    });
  };
};

module.exports = roleMiddleware;
module.exports.ROLE_LEVELS = ROLE_LEVELS;
