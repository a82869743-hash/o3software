/**
 * superAdmin — Restricts access strictly to Main Branch Super Admins.
 * Only users belonging to Main Studio Branch (franchise_id = 1 or null) with admin/super_admin role are allowed.
 */
module.exports = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }

  const isMainBranchUser = (!req.user.franchise_id || parseInt(req.user.franchise_id, 10) === 1);
  const isSuperAdmin = (req.user.role === 'admin' || req.user.role === 'super_admin') && isMainBranchUser;

  if (!isSuperAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Access Denied: Super Admin capabilities are strictly restricted to Main Studio Branch (Franchise ID 1).'
    });
  }

  next();
};
