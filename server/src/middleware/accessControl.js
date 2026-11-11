/**
 * accessControl.js — Central module/action enforcement for every authenticated API call.
 *
 * Called from middleware/auth.js (protect) once req.user + franchise scope are known.
 *   • super_admin           → always allowed
 *   • customer              → not handled here (route-level role lists decide)
 *   • admin                 → module must be enabled for the franchise and the action allowed by the Super Admin
 *   • manager / staff       → franchise entitlement ∩ role permissions (set by the franchise admin)
 *
 * When access is granted here, req.rbacGranted = true so route-level role() guards let the
 * manager/staff user through on routes historically written as role(['admin']).
 */
const pool = require('../config/db');
const { FEATURE_CATALOG } = require('../config/featureCatalog');
const { getFranchiseEntitlements } = require('./permissions');

// Longest prefix first so '/admin/roles' wins over shorter prefixes
const ROUTE_TABLE = FEATURE_CATALOG
  .flatMap(f => (f.routes || []).map(prefix => ({ prefix, feature: f })))
  .sort((a, b) => b.prefix.length - a.prefix.length);

// Endpoints every internal user (admin/manager/staff) may call for their OWN data.
// Controllers scope these to req.user.id.
const SELF_SERVICE = [
  /^\/staff\/(my-|check-in|check-out|premises$)/,
  /^\/staff-hr\/(tasks|leaves|attendance|payroll|my-)/,
  /^\/deliveries\/(my|active|assigned)(\/|$)/,
  /^\/deliveries\/\d+(\/(location|complete))?$/,
  /^\/pickup-requests\/?$/,                 // list: staff without the Pickups module get only their own (controller)
  /^\/pickup-requests\/\d+\/picked-up$/,    // controller allows only the assigned driver
  /^\/salary\/my(\/|$)/,
  /^\/referrals\/(my|invite)(\/|$)/,
  /^\/notifications\/my(\/|$)/,
  /^\/shared-files\/download\//,
];

// Read-only lookups that operational screens need regardless of module (catalog, studio info, pickers).
const REFERENCE_READS = [
  /^\/services(\/|$)/,
  /^\/packages\/?$/,
  /^\/packages\/\d+(\/services)?$/,
  /^\/settings(\/public|\/payment-qrs)?\/?$/,
  /^\/franchises\/?$/,
  /^\/staff\/(technicians|directory)\/?$/,
  /^\/customers\/lookup\//,
  /^\/job-carts\/vehicles\/lookup\//,
  /^\/search\//,
  /^\/inventory(\/categories)?\/?$/,
  /^\/slots(\/closures)?\/?$/,
  /^\/referrals\/(validate|code)\//,
  /^\/vendors\/?$/,                 // vendor picker on Buy & Sell
];

// Read-only calls that another module's screen depends on: allowed when the user has any of `perms`.
const READ_ALSO = [
  { rx: /^\/staff\/?$/, perms: ['staff_hr.view', 'salary.view'] },
  { rx: /^\/staff\/(all-attendance|attendance\/summary)\/?$/, perms: ['staff_hr.view', 'salary.view'] },
];

// Kept for the Super Admin only, even when the module is on for the franchise:
// deleting money records, and deciding who can do what (roles & permissions).
const SUPER_ADMIN_ONLY_ACTIONS = new Set([
  'payments.delete', 'accounts.delete', 'billing.delete',
  'roles.create', 'roles.edit', 'roles.delete',
]);

const permCache = new Map(); // userId → { at, perms:Set }
const CACHE_MS = 10000;

function clearPermissionCache(userId) {
  if (userId) permCache.delete(Number(userId)); else permCache.clear();
}

function resolveRoute(req) {
  // originalUrl: /api/job-carts/12/stages?x=1  → /job-carts/12/stages
  const raw = (req.originalUrl || req.url || '').split('?')[0].replace(/^\/api(\/v1)?/, '');
  const path = raw.replace(/\/+$/, '') || '/';
  const hit = ROUTE_TABLE.find(r => path === r.prefix || path.startsWith(r.prefix + '/'));
  if (!hit) return { path, feature: null, action: null };

  const sub = path.slice(hit.prefix.length) || '/';
  const m = req.method.toUpperCase();
  const acts = hit.feature.actions;
  let action;
  if (m === 'GET' || m === 'HEAD') {
    action = /export/i.test(sub) && acts.includes('export') ? 'export' : 'view';
  } else if (m === 'DELETE') {
    action = /^\/\d+\/.+/.test(sub) ? 'edit' : 'delete';
  } else if (m === 'POST') {
    action = /^\/\d+\/.+/.test(sub) ? 'edit' : 'create';
  } else {
    action = 'edit';
  }

  // Special actions
  if (hit.feature.key === 'job_cards' && /^\/\d+\/complete$/.test(sub)) action = 'complete';
  if (['referrals', 'salary'].includes(hit.feature.key) && /\/(pay|payout|mark-paid)(\/|$)/.test(sub)) action = 'pay';
  if (!acts.includes(action)) {
    if (action === 'view') action = acts[0];
    else if (acts.includes('edit')) action = 'edit';
  }

  return { path, sub, feature: hit.feature, action };
}

async function getRolePermissionKeys(user) {
  const [rows] = await pool.query(
    `SELECT p.permission_key FROM v2_role_permissions rp
     JOIN v2_permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = COALESCE(?, (SELECT id FROM v2_roles WHERE role_name = ? AND franchise_id IS NULL ORDER BY id LIMIT 1))`,
    [user.custom_role_id || null, user.role]
  );
  return rows.map(r => r.permission_key);
}

/**
 * Effective permission keys ("module.action") for an internal user, already intersected with the
 * franchise entitlement ceiling. super_admin gets every key.
 */
async function getEffectivePermissions(user) {
  if (!user) return [];
  if (user.role === 'super_admin') {
    return FEATURE_CATALOG.flatMap(f => f.actions.map(a => `${f.key}.${a}`));
  }
  if (user.role === 'customer') return [];

  const cached = permCache.get(Number(user.id));
  if (cached && Date.now() - cached.at < CACHE_MS) return [...cached.perms];

  const ent = await getFranchiseEntitlements(user.franchise_id || 1);
  const allowedByFranchise = (module, action) => {
    const e = ent[module];
    if (!e || !e.is_enabled) return false;
    return !Array.isArray(e.actions) || e.actions.length === 0 || e.actions.includes(action);
  };

  let keys;
  if (user.role === 'admin') {
    keys = FEATURE_CATALOG.filter(f => !f.isSuperAdminOnly)
      .flatMap(f => f.actions.filter(a => allowedByFranchise(f.key, a)).map(a => `${f.key}.${a}`))
      .filter(k => !SUPER_ADMIN_ONLY_ACTIONS.has(k));
  } else {
    keys = (await getRolePermissionKeys(user)).filter(k => {
      const [mod, act] = k.split('.');
      return allowedByFranchise(mod, act);
    });
  }
  permCache.set(Number(user.id), { at: Date.now(), perms: new Set(keys) });
  return keys;
}

/**
 * Express-style check. Calls next() or sends 403. Never throws.
 */
async function enforceModuleAccess(req, res, next) {
  try {
    const user = req.user;
    if (!user || user.role === 'customer') return next();
    if (user.role === 'super_admin') { req.rbacGranted = true; return next(); }

    const { path, feature, action } = resolveRoute(req);
    if (SELF_SERVICE.some(rx => rx.test(path))) return next();
    if (!feature || feature.isSuperAdminOnly) return next(); // route-level guards decide

    const perms = await getEffectivePermissions(user);
    req.userPermissions = perms;
    if (perms.includes(`${feature.key}.${action}`)) {
      req.rbacGranted = true;
      return next();
    }

    const isRead = req.method === 'GET' || req.method === 'HEAD';
    // Reads one module needs from another (e.g. HR page lists staff and their attendance)
    if (isRead && READ_ALSO.some(r => r.rx.test(path) && r.perms.some(p => perms.includes(p)))) {
      req.rbacGranted = true;
      return next();
    }
    if (isRead && REFERENCE_READS.some(rx => rx.test(path))) {
      req.rbacGranted = true;
      return next();
    }

    return res.status(403).json({
      success: false,
      error: user.role === 'admin' && SUPER_ADMIN_ONLY_ACTIONS.has(`${feature.key}.${action}`)
        ? `Only the Super Admin can ${action} in ${feature.name}.`
        : user.role === 'admin'
        ? `"${feature.name}" (${action}) is not enabled for your franchise. Please contact the Super Admin.`
        : `You don't have permission to ${action} ${feature.name}. Please contact your studio admin.`,
      code: 'PERMISSION_DENIED',
      permission: `${feature.key}.${action}`,
    });
  } catch (err) {
    console.error('[ACCESS] enforcement error:', err.message);
    return res.status(500).json({ success: false, error: 'Authorization check failed' });
  }
}

module.exports = { enforceModuleAccess, getEffectivePermissions, clearPermissionCache, resolveRoute };
