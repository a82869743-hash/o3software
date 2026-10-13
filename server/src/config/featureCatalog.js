/**
 * featureCatalog.js — Single Source of Truth for Feature Modules & Granular Actions
 * Central registry of every module/page/feature/action in O3 Car Spaa.
 * Defines presets (basic, pro, enterprise) and handles auto-registration into DB.
 */

const FEATURE_CATALOG = [
  {
    key: 'dashboard',
    name: 'Executive Dashboard & Analytics',
    description: 'Studio KPI metrics, daily revenue, active jobs and performance charts',
    category: 'Overview',
    actions: ['view', 'export'],
    defaultPresets: ['basic', 'pro', 'enterprise']
  },
  {
    key: 'job_cards',
    name: 'Job Cards & Detailing Workflow',
    description: 'Vehicle intake, detailing job cards, service tracking, photos & stage updates',
    category: 'Operations',
    actions: ['view', 'create', 'edit', 'delete', 'complete', 'apply_discount'],
    defaultPresets: ['basic', 'pro', 'enterprise']
  },
  {
    key: 'quick_wash',
    name: 'Quick Wash Express Queue',
    description: 'Fast-lane washing pipeline, rapid vehicle entry and status transition',
    category: 'Operations',
    actions: ['view', 'create', 'update'],
    defaultPresets: ['basic', 'pro', 'enterprise']
  },
  {
    key: 'slots',
    name: 'Slots & Calendar Schedule',
    description: 'Studio detailing bays, slot duration, capacity and holiday closures',
    category: 'Operations',
    actions: ['view', 'create', 'edit', 'block'],
    defaultPresets: ['basic', 'pro', 'enterprise']
  },
  {
    key: 'bookings',
    name: 'Bookings & Customer Appointments',
    description: 'Appointment reservations, advance deposits, approval and rescheduling',
    category: 'Operations',
    actions: ['view', 'create', 'edit', 'approve', 'reject', 'cancel'],
    defaultPresets: ['basic', 'pro', 'enterprise']
  },
  {
    key: 'pickups',
    name: 'Vehicle Pickups',
    description: 'Driver vehicle pickup dispatch, doorstep inspection and tracking',
    category: 'Operations',
    actions: ['view', 'create', 'assign', 'update'],
    defaultPresets: ['pro', 'enterprise']
  },
  {
    key: 'deliveries',
    name: 'Vehicle Deliveries',
    description: 'Finished vehicle home deliveries, driver live tracking and handoff',
    category: 'Operations',
    actions: ['view', 'create', 'assign', 'update'],
    defaultPresets: ['pro', 'enterprise']
  },
  {
    key: 'customers',
    name: 'Customer CRM & Vehicle Master',
    description: 'Customer directory, linked garage vehicles, visit history and notes',
    category: 'Customers',
    actions: ['view', 'create', 'edit', 'delete', 'export'],
    defaultPresets: ['basic', 'pro', 'enterprise']
  },
  {
    key: 'leads',
    name: 'Lead Management & Inquiries',
    description: 'Prospective customer leads, sales follow-ups and conversion pipelines',
    category: 'Customers',
    actions: ['view', 'create', 'edit', 'convert'],
    defaultPresets: ['pro', 'enterprise']
  },
  {
    key: 'packages',
    name: 'Annual Service Packages & Memberships',
    description: 'Prepaid membership packages, credit balances and renewal tracking',
    category: 'Customers',
    actions: ['view', 'create', 'edit', 'delete', 'approve'],
    defaultPresets: ['pro', 'enterprise']
  },
  {
    key: 'loyalty',
    name: 'Loyalty Rewards & Points Program',
    description: 'Point earning ratios, customer reward redemption and point ledgers',
    category: 'Customers',
    actions: ['view', 'redeem', 'adjust', 'settings'],
    defaultPresets: ['pro', 'enterprise']
  },
  {
    key: 'services',
    name: 'Services & Detailing Price Matrix',
    description: 'Car detailing catalog, pricing per vehicle category (Hatchback/Sedan/SUV)',
    category: 'Services',
    actions: ['view', 'create', 'edit', 'delete'],
    defaultPresets: ['basic', 'pro', 'enterprise']
  },
  {
    key: 'inventory',
    name: 'Inventory & Chemical Consumables',
    description: 'Stock levels, ceramic coatings, pads, shampoos and low-stock alerts',
    category: 'Inventory',
    actions: ['view', 'create', 'edit', 'delete', 'adjust'],
    defaultPresets: ['pro', 'enterprise']
  },
  {
    key: 'franchise_stock',
    name: 'Franchise Stock Requisitions',
    description: 'Internal central warehouse ordering, transfers and stock dispatch',
    category: 'Inventory',
    actions: ['view', 'create_order', 'approve_order'],
    defaultPresets: ['pro', 'enterprise']
  },
  {
    key: 'accounts',
    name: 'Accounts & Expense Ledger',
    description: 'Cash drawers, vendor disbursements, utility expenses and bank deposits',
    category: 'Finance',
    actions: ['view', 'create', 'edit', 'export'],
    defaultPresets: ['pro', 'enterprise']
  },
  {
    key: 'billing',
    name: 'Billing & POS Cashier Console',
    description: 'Manual POS sales, instant billing, payment collection and credit terms',
    category: 'Finance',
    actions: ['view', 'create', 'edit', 'cancel'],
    defaultPresets: ['basic', 'pro', 'enterprise']
  },
  {
    key: 'invoices',
    name: 'GST Tax Invoices & Credit Notes',
    description: 'Official GST tax invoices, invoice archival, reprint and PDF download',
    category: 'Finance',
    actions: ['view', 'print', 'download'],
    defaultPresets: ['basic', 'pro', 'enterprise']
  },
  {
    key: 'quotations',
    name: 'Cost Estimates & Quotations',
    description: 'Customer pre-job detailing quotations, estimation and WhatsApp share',
    category: 'Finance',
    actions: ['view', 'create', 'edit', 'delete', 'send'],
    defaultPresets: ['pro', 'enterprise']
  },
  {
    key: 'balance_sheet',
    name: 'Financial Statements & Balance Sheet',
    description: 'Profit and loss summaries, gross margin, asset tracking and GST reports',
    category: 'Finance',
    actions: ['view', 'export'],
    defaultPresets: ['enterprise']
  },
  {
    key: 'staff',
    name: 'Staff & Technician Directory',
    description: 'Employee profiles, role allocations, facial attendance and work logs',
    category: 'Staff & HR',
    actions: ['view', 'create', 'edit', 'delete', 'attendance'],
    defaultPresets: ['pro', 'enterprise']
  },
  {
    key: 'salary',
    name: 'Payroll & Technician Commissions',
    description: 'Monthly salary calculation, incentives, split commissions and payouts',
    category: 'Staff & HR',
    actions: ['view', 'process', 'pay'],
    defaultPresets: ['pro', 'enterprise']
  },
  {
    key: 'staff_hr',
    name: 'HR Tasks & Leave Requests',
    description: 'Staff leave applications, approval workflow and internal assignment tasks',
    category: 'Staff & HR',
    actions: ['view', 'create_task', 'update_task', 'approve_leaves'],
    defaultPresets: ['enterprise']
  },
  {
    key: 'messages',
    name: 'Notification Logs & SMS Broadcasts',
    description: 'Outbound customer SMS/WhatsApp delivery log and automated notifications',
    category: 'Communication',
    actions: ['view', 'send'],
    defaultPresets: ['pro', 'enterprise']
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp Automation & Engine',
    description: 'Companion device QR pairing, dynamic humanizer, templates & dispatches',
    category: 'Communication',
    actions: ['view', 'pair', 'send', 'settings'],
    defaultPresets: ['pro', 'enterprise']
  },
  {
    key: 'inquiries',
    name: 'Customer Support Inquiries',
    description: 'Inbound customer inquiries from website, portal and booking forms',
    category: 'Communication',
    actions: ['view', 'reply'],
    defaultPresets: ['basic', 'pro', 'enterprise']
  },
  {
    key: 'feedback',
    name: 'Customer Reviews & Feedback',
    description: 'Job satisfaction ratings, Google review triggers and customer feedback',
    category: 'Communication',
    actions: ['view', 'reply', 'publish'],
    defaultPresets: ['pro', 'enterprise']
  },
  {
    key: 'reports',
    name: 'Management Business Reports',
    description: 'Daily revenue, service popularity, technician productivity, audit exports',
    category: 'Reports',
    actions: ['view', 'export'],
    defaultPresets: ['pro', 'enterprise']
  },
  {
    key: 'roles',
    name: 'Custom Roles & RBAC Matrix',
    description: 'Franchise custom staff roles, granular action permissions checklist',
    category: 'System',
    actions: ['view', 'create', 'edit', 'delete'],
    defaultPresets: ['pro', 'enterprise']
  },
  {
    key: 'settings',
    name: 'Studio Configuration & Branding',
    description: 'Studio operating hours, UPI details, GSTIN, receipt footers and defaults',
    category: 'System',
    actions: ['view', 'edit'],
    defaultPresets: ['basic', 'pro', 'enterprise']
  },
  {
    key: 'franchises',
    name: 'Franchise Network & Platform Administration',
    description: 'Super Admin only: multi-branch management, entitlements and impersonation',
    category: 'Super Admin',
    actions: ['view', 'create', 'edit', 'delete', 'entitlements', 'impersonate'],
    defaultPresets: ['enterprise'],
    isSuperAdminOnly: true
  },
  {
    key: 'audit_logs',
    name: 'Security & Activity Audit Logs',
    description: 'Append-only audit trail of system operations, discounts, logins & impersonations',
    category: 'Super Admin',
    actions: ['view', 'export'],
    defaultPresets: ['enterprise'],
    isSuperAdminOnly: true
  }
];

/**
 * Returns all catalog modules
 */
function getAllFeatures() {
  return FEATURE_CATALOG;
}

/**
 * Generates an entitlement map for a specified preset tier: 'basic', 'pro', or 'enterprise'
 */
function getPresetEntitlements(presetName = 'pro') {
  const normalized = (presetName || 'pro').toLowerCase();
  const result = {};

  for (const feature of FEATURE_CATALOG) {
    if (feature.isSuperAdminOnly) {
      continue; // Super admin modules are never franchised
    }

    const isEnabled = feature.defaultPresets.includes(normalized) || normalized === 'enterprise';
    result[feature.key] = {
      is_enabled: isEnabled,
      actions: isEnabled ? [...feature.actions] : []
    };
  }

  return result;
}

/**
 * Synchronizes the feature catalog with MySQL tables:
 * - Inserts any new permissions into `v2_permissions`
 * - Seeds default entitlements for active franchises
 */
async function syncFeatureCatalogToDb(pool) {
  try {
    const conn = await pool.getConnection();
    try {
      // 1. Sync v2_permissions
      for (const feature of FEATURE_CATALOG) {
        for (const action of feature.actions) {
          const permKey = `${feature.key}.${action}`;
          await conn.query(
            `INSERT INTO v2_permissions (permission_key, module, action, description)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE description = VALUES(description)`,
            [permKey, feature.key, action, `${action} access for ${feature.name}`]
          );
        }
      }

      // 2. Seed entitlements for existing franchises if empty
      const [franchises] = await conn.query('SELECT id, plan_tier FROM franchises WHERE is_deleted = 0');
      for (const f of franchises) {
        const [existing] = await conn.query('SELECT COUNT(*) as count FROM franchise_entitlements WHERE franchise_id = ?', [f.id]);
        if (existing[0].count === 0) {
          const presetTier = f.plan_tier || 'enterprise';
          const preset = getPresetEntitlements(presetTier);
          for (const [featKey, ent] of Object.entries(preset)) {
            await conn.query(
              `INSERT INTO franchise_entitlements (franchise_id, feature_key, actions_json, is_enabled)
               VALUES (?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE actions_json = VALUES(actions_json), is_enabled = VALUES(is_enabled)`,
              [f.id, featKey, JSON.stringify(ent.actions), ent.is_enabled ? 1 : 0]
            );
          }
          console.log(`[CATALOG] Initialized default ${presetTier} entitlements for Franchise #${f.id}`);
        }
      }
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('[CATALOG] Error syncing feature catalog to database:', err.message);
  }
}

module.exports = {
  FEATURE_CATALOG,
  getAllFeatures,
  getPresetEntitlements,
  syncFeatureCatalogToDb
};
