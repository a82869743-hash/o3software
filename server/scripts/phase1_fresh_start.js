/**
 * phase1_fresh_start.js — One-time reset to a clean, real-data-only O3 Car Spaa system.
 *
 *  - Keeps ONE franchise (id 1) and re-points it to the Anand studio.
 *  - Removes every demo/test record (customers, staff, job cards, bills, leads, logs ...).
 *  - Removes the legacy (GK Autoherb) services / packages / products catalog.
 *  - Keeps configuration: permissions catalog, system roles, WhatsApp templates,
 *    payment methods, expense categories, service categories, settings, payment QR.
 *  - Keeps the Super Admin and ONE franchise admin login.
 *
 * Always take a mysqldump first. Usage:  node scripts/phase1_fresh_start.js --yes
 */
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const KEEP_USER_ROLES = ['super_admin'];
const KEEP_ADMIN_MOBILE = process.env.FRESH_START_ADMIN_MOBILE || '9316668760';

// Transactional / demo tables — emptied completely
const WIPE_TABLES = [
  // job cards & operations
  'job_carts', 'job_services', 'job_products', 'job_photos', 'job_card_stages', 'job_card_stage_history',
  'job_card_edit_logs', 'incentive_splits', 'warranty_certificates', 'deliveries', 'v2_pickup_requests',
  'v2_tracking_history', 'bookings', 'booking_services', 'booking_slots', 'slots', 'slot_closures', 'v2_blocked_slots',
  // customers & vehicles
  'vehicles', 'customer_notes', 'loyalty', 'loyalty_transactions', 'customer_rewards', 'v2_reward_logs',
  'referral_codes', 'referral_rewards', 'v2_referrals', 'wallets', 'wallet_transactions', 'v2_wallets',
  'v2_wallet_transactions', 'v2_customer_addresses', 'user_packages', 'package_usage', 'package_renewals',
  'package_requests', 'v2_package_renewals', 'v2_package_usage_logs', 'product_orders',
  // finance
  'transactions', 'manual_bills', 'manual_bill_items', 'return_bills', 'payments', 'v2_payments',
  'v2_payment_transactions', 'advance_payments', 'refunds', 'v2_refunds', 'quotations', 'quotation_items',
  'expenses', 'v2_expenses', 'buy_sell', 'vendors', 'v2_vendors', 'v2_purchases', 'v2_purchase_items',
  'v2_gst_records',
  // staff & HR
  'staff_profiles', 'staff_salary', 'staff_payments', 'staff_attendance', 'staff_leaves', 'staff_tasks',
  'staff_performance', 'v2_attendance', 'v2_leaves', 'v2_payroll', 'v2_tasks',
  // inventory (legacy GK products)
  'inventory', 'franchise_inventory_pricing', 'franchise_stock_requests', 'v2_inventory_items',
  'v2_inventory_movements', 'package_products',
  // catalog (legacy GK services & packages)
  'services', 'service_addons', 'packages', 'package_services', 'package_pricing', 'package_vehicle_pricing',
  'package_service_schedules', 'vehicle_master',
  // communication & CRM
  'inquiries', 'feedback', 'v2_feedback', 'v2_review_requests', 'messages_log', 'whatsapp_messages',
  'whatsapp_conversations', 'whatsapp_opt_outs', 'whatsapp_opt_ins', 'whatsapp_usage_logs',
  'v2_notification_logs', 'leads', 'lead_messages', 'franchise_knowledge_base',
  // files & logs
  'shared_files', 'v2_file_attachments', 'audit_logs', 'v2_audit_logs',
];

const ANAND = {
  name: 'O3 Car Spaa - Anand',
  code: 'O3-ANAND',
  address: 'Plot No. 37, Zone No. D5, Opp. Bank of Baroda, GIDC, Vitthal Udyognagar, Anand, Gujarat 388121',
  city: 'Anand',
  state: 'Gujarat',
  phone: '7225030303',
  email: 'o3carspavvn@gmail.com',
};

async function main() {
  if (!process.argv.includes('--yes')) {
    console.log('Refusing to run without --yes (take a mysqldump backup first).');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });

  const [existingTables] = await conn.query(
    'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?', [process.env.DB_NAME]
  );
  const have = new Set(existingTables.map(r => r.t));

  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const t of WIPE_TABLES) {
      if (!have.has(t)) continue;
      await conn.query(`DELETE FROM \`${t}\``);
      try { await conn.query(`ALTER TABLE \`${t}\` AUTO_INCREMENT = 1`); } catch { /* ignore */ }
      console.log(`  cleared ${t}`);
    }

    // ── Franchises: keep only #1, re-point to Anand ──
    await conn.query('DELETE FROM franchises WHERE id <> 1');
    await conn.query(
      `UPDATE franchises SET name=?, code=?, address=?, city=?, state=?, phone=?, email=?, is_active=1, is_deleted=0,
       deleted_at=NULL, plan_tier='enterprise' WHERE id = 1`,
      [ANAND.name, ANAND.code, ANAND.address, ANAND.city, ANAND.state, ANAND.phone, ANAND.email]
    );
    await conn.query('ALTER TABLE franchises AUTO_INCREMENT = 2');

    // Per-franchise config rows belonging to removed franchises
    for (const t of ['franchise_entitlements', 'franchise_whatsapp_settings', 'franchise_ai_settings',
      'incentive_rules', 'loyalty_rules', 'settings']) {
      if (have.has(t)) await conn.query(`DELETE FROM \`${t}\` WHERE franchise_id IS NOT NULL AND franchise_id <> 1`);
    }
    // Custom roles that belonged to other franchises
    await conn.query('DELETE FROM v2_roles WHERE franchise_id IS NOT NULL AND franchise_id <> 1');
    await conn.query('DELETE FROM v2_role_permissions WHERE role_id NOT IN (SELECT id FROM v2_roles)');

    // ── Users: Super Admin + one franchise admin ──
    const [del] = await conn.query(
      `DELETE FROM users WHERE role NOT IN (?) AND NOT (role = 'admin' AND mobile = ?)`,
      [KEEP_USER_ROLES, KEEP_ADMIN_MOBILE]
    );
    console.log(`  removed ${del.affectedRows} demo users`);
    await conn.query(
      `UPDATE users SET franchise_id = 1, failed_login_attempts = 0, locked_until = NULL, referral_code = NULL,
       referred_by = NULL WHERE role IN ('super_admin','admin')`
    );
    await conn.query(`UPDATE users SET name = 'Anand Studio Admin' WHERE role = 'admin' AND mobile = ?`, [KEEP_ADMIN_MOBILE]);

    // ── De-duplicate seed lookup tables ──
    await conn.query(`DELETE e1 FROM expense_categories e1 JOIN expense_categories e2 ON e1.name = e2.name AND e1.id > e2.id`);
    await conn.query(`DELETE p1 FROM payment_methods p1 JOIN payment_methods p2 ON p1.name = p2.name AND p1.id > p2.id`);

    // ── Studio settings: real O3 Anand values, fresh counters ──
    const settings = {
      studio_name: 'O3 Car Spaa',
      studio_address: ANAND.address,
      studio_mobile: ANAND.phone,
      studio_email: ANAND.email,
      invoice_prefix: 'O3',
      invoice_counter: '0',
      quotation_prefix: 'QT',
    };
    for (const [k, v] of Object.entries(settings)) {
      await conn.query(
        `INSERT INTO settings (franchise_id, key_name, value) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [k, v]
      );
    }
    if (have.has('payment_qrs')) {
      await conn.query(`UPDATE payment_qrs SET title = 'O3 Car Spaa UPI', upi_name = 'O3 Car Spaa'`);
    }
  } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  const [users] = await conn.query('SELECT id, name, mobile, role, franchise_id FROM users');
  console.log('\nRemaining users:');
  users.forEach(u => console.log(`  #${u.id} ${u.name} (${u.mobile}) ${u.role} f${u.franchise_id}`));
  const [fr] = await conn.query('SELECT id, name, city FROM franchises');
  console.log('Franchises:', fr);
  await conn.end();
}

main().catch(err => { console.error('Fresh start failed:', err); process.exit(1); });
