/**
 * featureCatalog.js — Single source of truth for modules, their actions and the API routes they own.
 *
 * Access model (enforced centrally by middleware/auth.js → accessControl):
 *   super_admin  → everything, every franchise.
 *   admin        → every module the Super Admin has ENABLED for their franchise (franchise_entitlements),
 *                  limited to the actions the Super Admin allowed.
 *   manager/staff→ (franchise entitlement) ∩ (permissions of their role, managed by the franchise admin).
 *   customer     → customer self-service endpoints only (route-level role lists).
 */

const STD = ['view', 'create', 'edit', 'delete'];

const FEATURE_CATALOG = [
  // ── Overview ──
  { key: 'dashboard', name: 'Dashboard', description: 'Live KPIs: revenue, jobs, bookings, customers', category: 'Overview', actions: ['view'], routes: ['/dashboard'] },
  { key: 'reports', name: 'Reports & Exports', description: 'Sales, job card, inventory and incentive reports', category: 'Overview', actions: ['view', 'export'], routes: ['/reports'] },

  // ── Operations ──
  { key: 'job_cards', name: 'Job Cards', description: 'Vehicle intake, services, photos, pipeline stages, billing', category: 'Operations', actions: [...STD, 'complete', 'apply_discount'], routes: ['/job-carts', '/job-cards'] },
  { key: 'quick_wash', name: 'Quick Wash', description: 'Fast-lane wash queue and billing', category: 'Operations', actions: ['view', 'create', 'edit'], routes: ['/quick-wash'] },
  { key: 'slots', name: 'Slots & Calendar', description: 'Bay slots, capacity and holiday closures', category: 'Operations', actions: STD, routes: ['/slots'] },
  { key: 'bookings', name: 'Customer Bookings', description: 'Appointments, approvals, reschedules', category: 'Operations', actions: STD, routes: ['/bookings'] },
  { key: 'pickups', name: 'Vehicle Pickups', description: 'Doorstep pickup requests and driver assignment', category: 'Operations', actions: ['view', 'create', 'edit'], routes: ['/pickups', '/pickup-requests'] },
  { key: 'deliveries', name: 'Vehicle Deliveries', description: 'Deliveries with live driver GPS tracking', category: 'Operations', actions: ['view', 'create', 'edit'], routes: ['/deliveries'] },

  // ── Customers ──
  { key: 'customers', name: 'Customers & Vehicles', description: 'Customer CRM, vehicles, notes, history', category: 'Customers', actions: [...STD, 'export'], routes: ['/customers', '/vehicles', '/search'] },
  { key: 'leads', name: 'Leads & AI Agent', description: 'Sales leads from every channel, AI agent, conversations', category: 'Customers', actions: STD, routes: ['/leads'] },
  { key: 'inquiries', name: 'Inquiries', description: 'Service / support questions from existing customers', category: 'Customers', actions: STD, routes: ['/inquiries'] },
  { key: 'packages', name: 'Packages & Memberships', description: 'Prepaid packages, approvals, usage tracking, alerts', category: 'Customers', actions: STD, routes: ['/packages', '/user-packages'] },
  { key: 'loyalty', name: 'Loyalty & Rewards', description: 'Points, rewards and wallets', category: 'Customers', actions: STD, routes: ['/loyalty', '/customer-rewards', '/wallets'] },
  { key: 'referrals', name: 'Referrals', description: 'Referral earnings, top referrers, payouts', category: 'Customers', actions: [...STD, 'pay'], routes: ['/referrals'] },
  { key: 'feedback', name: 'Feedback & Reviews', description: 'Post-service ratings and reviews', category: 'Customers', actions: ['view', 'edit'], routes: ['/feedback'] },

  // ── Catalog ──
  { key: 'services', name: 'Services Catalog', description: 'Services and per-car-type prices', category: 'Catalog', actions: STD, routes: ['/services'] },
  { key: 'inventory', name: 'Inventory & Products', description: 'Stock, products, buy & sell, product orders', category: 'Catalog', actions: STD, routes: ['/inventory', '/buy-sell', '/products'] },
  { key: 'franchise_stock', name: 'Franchise Stock Orders', description: 'Stock requests from franchise to HQ', category: 'Catalog', actions: ['view', 'create'], routes: ['/stock-requests'] },

  // ── Finance ──
  { key: 'accounts', name: 'Accounts & Vendors', description: 'Ledger, vendors, purchase bills, pending dues', category: 'Finance', actions: [...STD, 'export'], routes: ['/accounts', '/vendors', '/purchase-bills'] },
  { key: 'payments', name: 'Payments', description: 'Collections, advances, refunds, reminders', category: 'Finance', actions: STD, routes: ['/payments'] },
  { key: 'billing', name: 'Manual Billing', description: 'Counter bills / POS', category: 'Finance', actions: STD, routes: ['/billing'] },
  { key: 'invoices', name: 'Invoices', description: 'All tax invoices, reprint, export', category: 'Finance', actions: ['view', 'export'], routes: ['/invoices'] },
  { key: 'quotations', name: 'Quotations', description: 'Estimates sent before work (not invoices)', category: 'Finance', actions: STD, routes: ['/quotations'] },
  { key: 'balance_sheet', name: 'Balance Sheet & GST', description: 'P&L, expenses, GST reports', category: 'Finance', actions: ['view', 'create', 'export'], routes: ['/balance-sheet', '/gst-reports'] },

  // ── Staff & HR ──
  { key: 'staff', name: 'Staff Directory', description: 'Staff accounts, attendance', category: 'Staff & HR', actions: STD, routes: ['/staff'] },
  { key: 'salary', name: 'Salary & Incentives', description: 'Salary rules, auto-generated payroll, incentives, referral payouts', category: 'Staff & HR', actions: ['view', 'create', 'edit', 'pay'], routes: ['/salary', '/incentives'] },
  { key: 'staff_hr', name: 'HR: Tasks & Leaves', description: 'Leave approvals, tasks, attendance overview', category: 'Staff & HR', actions: ['view', 'create', 'edit'], routes: ['/staff-hr'] },

  // ── Communication ──
  { key: 'whatsapp', name: 'WhatsApp', description: 'WhatsApp engine, templates, notification history', category: 'Communication', actions: ['view', 'create', 'edit'], routes: ['/whatsapp', '/messages', '/notifications'] },

  // ── System ──
  { key: 'roles', name: 'Staff Roles & Permissions', description: 'Create staff roles and choose what each can do', category: 'System', actions: STD, routes: ['/roles', '/admin/roles'] },
  { key: 'import', name: 'Excel Import', description: 'Bulk import customers, inventory, services', category: 'System', actions: ['create'], routes: ['/import'] },
  { key: 'settings', name: 'Studio Settings', description: 'Studio profile, payment QR, invoice settings', category: 'System', actions: ['view', 'edit'], routes: ['/settings'] },
  { key: 'files', name: 'Shared Files', description: 'Upload and share files', category: 'System', actions: ['view', 'create', 'delete'], routes: ['/shared-files'] },

  // ── Super Admin only (never granted to franchises) ──
  { key: 'franchises', name: 'Franchise Network', description: 'Franchises, admins, module access, price visibility', category: 'Super Admin', actions: STD, routes: ['/franchises'], isSuperAdminOnly: true },
  { key: 'audit_logs', name: 'Audit Logs', description: 'Security & activity audit trail', category: 'Super Admin', actions: ['view'], routes: ['/audit'], isSuperAdminOnly: true },
  { key: 'archive', name: 'Recycle Bin', description: 'Restore deleted records', category: 'Super Admin', actions: ['view'], routes: ['/archive'], isSuperAdminOnly: true },
];

/** Default permissions for the built-in staff templates (franchise admins can create their own roles). */
const DEFAULT_ROLE_TEMPLATES = {
  manager: {
    dashboard: ['view'], reports: ['view', 'export'],
    job_cards: ['view', 'create', 'edit', 'complete', 'apply_discount'], quick_wash: ['view', 'create', 'edit'],
    slots: ['view', 'create', 'edit'], bookings: ['view', 'create', 'edit'], pickups: ['view', 'create', 'edit'],
    deliveries: ['view', 'create', 'edit'], customers: ['view', 'create', 'edit', 'export'], leads: ['view', 'create', 'edit'],
    inquiries: ['view', 'create', 'edit'], packages: ['view', 'create', 'edit'], loyalty: ['view', 'edit'],
    referrals: ['view'], feedback: ['view', 'edit'], services: ['view'], inventory: ['view', 'edit'],
    payments: ['view', 'create'], billing: ['view', 'create'], invoices: ['view', 'export'], quotations: ['view', 'create', 'edit'],
    staff: ['view'], staff_hr: ['view', 'create', 'edit'], whatsapp: ['view', 'create'], files: ['view', 'create'],
  },
  staff: {
    job_cards: ['view', 'create', 'edit'], quick_wash: ['view', 'create', 'edit'], slots: ['view'], bookings: ['view'],
    pickups: ['view', 'edit'], deliveries: ['view', 'edit'], customers: ['view', 'create'], inquiries: ['view', 'create'],
    leads: ['view'], services: ['view'], inventory: ['view'], files: ['view'],
  },
};

function getAllFeatures() {
  return FEATURE_CATALOG.map(({ routes, ...f }) => f);
}

function getPresetEntitlements(presetName = 'enterprise') {
  const normalized = (presetName || 'enterprise').toLowerCase();
  const basic = new Set(['dashboard', 'job_cards', 'quick_wash', 'slots', 'bookings', 'customers', 'inquiries', 'services', 'billing', 'invoices', 'settings', 'staff', 'feedback']);
  const result = {};
  for (const feature of FEATURE_CATALOG) {
    if (feature.isSuperAdminOnly) continue;
    const enabled = normalized === 'enterprise' || normalized === 'pro' || basic.has(feature.key);
    // Catalog & pricing changes stay with HQ unless the Super Admin explicitly allows them
    let actions = [...feature.actions];
    if (feature.key === 'services') actions = ['view'];
    result[feature.key] = { is_enabled: enabled, actions: enabled ? actions : [] };
  }
  return result;
}

/**
 * Sync catalog → v2_permissions, seed missing franchise entitlements and the built-in role templates.
 */
async function syncFeatureCatalogToDb(pool) {
  const conn = await pool.getConnection();
  try {
    const validKeys = [];
    for (const feature of FEATURE_CATALOG) {
      for (const action of feature.actions) {
        const permKey = `${feature.key}.${action}`;
        validKeys.push(permKey);
        await conn.query(
          `INSERT INTO v2_permissions (permission_key, module, action, description) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE module = VALUES(module), action = VALUES(action), description = VALUES(description)`,
          [permKey, feature.key, action, `${action} — ${feature.name}`]
        );
      }
    }
    // Drop stale permission keys from older catalogs
    await conn.query('DELETE FROM v2_role_permissions WHERE permission_id IN (SELECT id FROM v2_permissions WHERE permission_key NOT IN (?))', [validKeys]);
    await conn.query('DELETE FROM v2_permissions WHERE permission_key NOT IN (?)', [validKeys]);

    // Entitlements: add any module missing for each franchise (new modules default to enabled)
    const [franchises] = await conn.query('SELECT id, plan_tier FROM franchises WHERE is_deleted = 0');
    for (const f of franchises) {
      const preset = getPresetEntitlements(f.plan_tier || 'enterprise');
      for (const [featKey, ent] of Object.entries(preset)) {
        await conn.query(
          `INSERT IGNORE INTO franchise_entitlements (franchise_id, feature_key, actions_json, is_enabled) VALUES (?, ?, ?, ?)`,
          [f.id, featKey, JSON.stringify(ent.actions), ent.is_enabled ? 1 : 0]
        );
      }
      await conn.query('DELETE FROM franchise_entitlements WHERE franchise_id = ? AND feature_key NOT IN (?)', [f.id, Object.keys(preset)]);
    }

    // Built-in templates: seed once (only when the template has no permissions yet)
    for (const [roleName, perms] of Object.entries(DEFAULT_ROLE_TEMPLATES)) {
      let [roles] = await conn.query('SELECT id FROM v2_roles WHERE role_name = ? AND franchise_id IS NULL', [roleName]);
      let roleId;
      if (!roles.length) {
        const [ins] = await conn.query('INSERT INTO v2_roles (role_name, description, is_system_role, franchise_id) VALUES (?, ?, 0, NULL)',
          [roleName, roleName === 'manager' ? 'Studio manager (default template)' : 'Workshop staff (default template)']);
        roleId = ins.insertId;
      } else {
        roleId = roles[0].id;
      }
      const [[{ c }]] = await conn.query('SELECT COUNT(*) AS c FROM v2_role_permissions WHERE role_id = ?', [roleId]);
      if (c > 0) continue;
      const keys = Object.entries(perms).flatMap(([m, acts]) => acts.map(a => `${m}.${a}`));
      await conn.query(
        `INSERT IGNORE INTO v2_role_permissions (role_id, permission_id) SELECT ?, id FROM v2_permissions WHERE permission_key IN (?)`,
        [roleId, keys]
      );
    }
  } finally {
    conn.release();
  }
}

module.exports = {
  FEATURE_CATALOG,
  DEFAULT_ROLE_TEMPLATES,
  getAllFeatures,
  getPresetEntitlements,
  syncFeatureCatalogToDb,
};
