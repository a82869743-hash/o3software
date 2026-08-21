/**
 * roleMiddleware — Checks if authenticated user has an allowed role.
 * Usage: roleMiddleware(['admin', 'staff'])
 */
const roleMiddleware = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Access denied — insufficient role' });
    }
    next();
  };
};

module.exports = roleMiddleware;
