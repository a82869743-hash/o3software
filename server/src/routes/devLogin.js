// One-click test logins for local review ONLY.
// Active only when DEV_LOGIN_LINKS=true, NODE_ENV is not production, the request comes from this computer,
// and the git-ignored LOGINS.local.txt exists. It signs in with the test account for that role (normal login,
// same token rules) — never available on a server.
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const enabled = () => process.env.DEV_LOGIN_LINKS === 'true' && process.env.NODE_ENV !== 'production';
const isLocal = ip => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(String(ip || ''));

router.get('/', async (req, res) => {
  if (!enabled() || !isLocal(req.ip || req.socket?.remoteAddress)) return res.status(404).json({ success: false, error: 'Not found' });
  // ?user=<id> signs in a customer or a staff member (any role except admin / super admin) — no password needed.
  if (req.query.user) {
    const pool = require('../config/db');
    const [[u]] = await pool.query("SELECT id, name, mobile, role, franchise_id, token_version, custom_role_id FROM users WHERE id = ? AND role IN ('customer','staff','manager')", [Number(req.query.user)]);
    if (!u) return res.status(404).json({ success: false, error: 'No customer or staff with this id' });
    const user = { id: u.id, name: u.name, mobile: u.mobile, role: u.role, franchise_id: u.franchise_id || 1, token_version: u.token_version || 1 };
    const token = require('../controllers/authController').generateToken(user);
    user.permissions = u.role === 'customer' ? [] : await require('../middleware/accessControl').getEffectivePermissions({ ...user, custom_role_id: u.custom_role_id });
    return res.json({ success: true, data: { user, token } });
  }
  const role = String(req.query.as || '').replace(/[^a-z_0-9]/g, '');
  let creds = null;
  try {
    const txt = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'LOGINS.local.txt'), 'utf8');
    for (const l of txt.split('\n')) {
      const m = l.match(/^(\w+)\s*\|.*mobile (\d{10}) \| password (\S+)/);
      if (m && m[1] === role) creds = { mobile: m[2], password: m[3] };
    }
  } catch { /* no file → no dev logins */ }
  if (!creds) return res.status(404).json({ success: false, error: 'No test account for this role' });
  req.body = creds;
  return require('../controllers/authController').login(req, res);
});

module.exports = router;
