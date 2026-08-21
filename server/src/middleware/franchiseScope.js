/**
 * franchiseScope — Middleware for multi-tenant database access control.
 * Enforces strict isolation per franchise profile while allowing Main Admin to view/switch.
 */
const franchiseScope = (req, res, next) => {
  if (!req.user) {
    req.franchiseId = 1;
    req.isGlobalAdmin = false;
    return next();
  }

  const role = req.user.role;
  const userFranchiseId = req.user.franchise_id ? parseInt(req.user.franchise_id, 10) : 1;
  const isMainBranchUser = (userFranchiseId === 1 || req.user.franchise_id === null);

  // ONLY users belonging to Main Studio Branch (Franchise ID 1) with admin/super_admin role have Global Admin privileges
  const isSuperAdmin = (role === 'admin' || role === 'super_admin') && isMainBranchUser;
  req.isSuperAdmin = isSuperAdmin;

  const headerFranchiseId = req.headers['x-franchise-id'] || req.query.franchise_id;

  if (isSuperAdmin) {
    if (headerFranchiseId && headerFranchiseId !== 'all' && headerFranchiseId !== '0') {
      req.franchiseId = parseInt(headerFranchiseId, 10) || 1;
      req.isGlobalAdmin = false;
    } else {
      req.franchiseId = null; // null means all franchises for main admin
      req.isGlobalAdmin = true;
    }
  } else {
    // Branch Admins and other roles are strictly locked to their assigned franchise_id
    req.franchiseId = userFranchiseId;
    req.isGlobalAdmin = false;
  }

  /**
   * Helper function to append SQL franchise filter to WHERE clauses.
   * @param {string} columnAlias e.g. 'inventory.franchise_id' or 'jc.franchise_id' or 'franchise_id'
   * @returns {{ clause: string, params: Array }}
   */
  req.getFranchiseCondition = (columnAlias = 'franchise_id') => {
    if (req.isGlobalAdmin) {
      return { clause: '', params: [] };
    }
    return {
      clause: ` AND (${columnAlias} = ? OR ${columnAlias} IS NULL)`,
      params: [req.franchiseId]
    };
  };

  next();
};

module.exports = franchiseScope;
