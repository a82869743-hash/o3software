/**
 * superAdmin — Restricts access strictly to Platform Super Admins.
 * Only users with role === 'super_admin' are allowed.
 * Franchise Admins (even for Main Studio Branch) are strictly barred.
 */
module.exports = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }

  if (req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      error: 'Access Denied: Platform Super Admin authority required.'
    });
  }

  next();
};
