/**
 * phase1_schema.js — Idempotent schema for the Phase-1 launch features.
 * Runs automatically on server start (after migrate_columns) and can be run by hand:
 *   node scripts/phase1_schema.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
    [table, column]
  );
  return rows.length > 0;
}

async function indexExists(conn, table, index) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?',
    [table, index]
  );
  return rows.length > 0;
}

async function addColumn(conn, table, column, definition) {
  if (!(await columnExists(conn, table, column))) {
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`  [phase1] + ${table}.${column}`);
  }
}

const TABLES = [
  // Customer belongings noted at vehicle check-in (job card)
  `CREATE TABLE IF NOT EXISTS job_cart_belongings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    job_cart_id INT UNSIGNED NOT NULL,
    description VARCHAR(500) NOT NULL,
    image_url VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_belong_cart (job_cart_id)
  )`,
  // Per-service counters for a customer's purchased package
  `CREATE TABLE IF NOT EXISTS user_package_usage (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_package_id INT UNSIGNED NOT NULL,
    service_name VARCHAR(150) NOT NULL,
    total_count INT NOT NULL DEFAULT 0,
    used_count INT NOT NULL DEFAULT 0,
    remaining INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_upu (user_package_id, service_name)
  )`,
  // One-time passwords (login, forgot password, registration) — DB backed so it works across PM2 workers
  `CREATE TABLE IF NOT EXISTS otp_codes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    mobile VARCHAR(15) NOT NULL,
    purpose ENUM('login','reset','register') NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    expires_at DATETIME NOT NULL,
    consumed_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_otp_mobile (mobile, purpose)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Which price tiers each role may SEE — editable by the Super Admin only
  `CREATE TABLE IF NOT EXISTS price_visibility (
    role VARCHAR(20) NOT NULL,
    price_field VARCHAR(40) NOT NULL,
    is_visible TINYINT(1) NOT NULL DEFAULT 0,
    updated_by INT UNSIGNED NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (role, price_field)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Every referral earning (job card, quick wash, manual bill, customer referral code)
  `CREATE TABLE IF NOT EXISTS referral_ledger (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    franchise_id INT UNSIGNED NOT NULL DEFAULT 1,
    referrer_type ENUM('staff','customer','external') NOT NULL,
    referrer_user_id INT UNSIGNED NULL,
    referrer_name VARCHAR(150) NOT NULL,
    referrer_mobile VARCHAR(15) NULL,
    referred_customer_id INT UNSIGNED NULL,
    referred_customer_name VARCHAR(150) NULL,
    source_type ENUM('job_card','quick_wash','manual_bill','registration','manual') NOT NULL,
    source_id INT UNSIGNED NULL,
    source_label VARCHAR(150) NULL,
    bill_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    reward_type ENUM('fixed','percent') NOT NULL DEFAULT 'fixed',
    reward_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    status ENUM('pending','unpaid','paid','cancelled') NOT NULL DEFAULT 'pending',
    paid_at DATETIME NULL,
    paid_via ENUM('salary','cash','upi','bank','wallet') NULL,
    salary_id INT UNSIGNED NULL,
    paid_by INT UNSIGNED NULL,
    notes VARCHAR(255) NULL,
    created_by INT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ref_source (source_type, source_id),
    INDEX idx_ref_referrer (referrer_type, referrer_user_id),
    INDEX idx_ref_status (franchise_id, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

// [table, column, definition]
const COLUMNS = [
  ['payment_qrs', 'franchise_id', 'INT UNSIGNED NOT NULL DEFAULT 1'],
  ['payment_qrs', 'upi_number', 'VARCHAR(20) NULL'],
  ['inventory', 'description', 'TEXT NULL'],
  ['job_carts', 'km_reading', 'VARCHAR(20) NULL'],
  ['users', 'address', 'VARCHAR(300) NULL'],
  // WhatsApp can be a different number from the login mobile
  ['users', 'whatsapp_number', 'VARCHAR(15) NULL'],
  ['packages', 'image_url', 'VARCHAR(500) NULL'],
  ['user_packages', 'last_reminder_at', 'DATETIME NULL'],
  ['packages', 'pickup_enabled', 'TINYINT(1) NOT NULL DEFAULT 0'],
  // repeat visits: a service can come back every N months (e.g. ceramic coating yearly check-up)
  ['bookings', 'offer_code', 'VARCHAR(40) NULL'],
  ['v2_leaves', 'pay_type', "ENUM('paid','unpaid') NULL"],
  ['user_packages', 'reminder_count', 'INT NOT NULL DEFAULT 0'],
  ['job_carts', 'payment_reminder_count', 'INT NOT NULL DEFAULT 0'],
  ['job_carts', 'last_payment_reminder_at', 'DATETIME NULL'],
  ['services', 'revisit_every_months', 'INT NULL'],
  ['services', 'revisit_times', 'INT NOT NULL DEFAULT 1'],
  // one schedule table for package visits and service repeat visits
  ['package_service_schedules', 'vehicle_id', 'INT NULL'],
  ['package_service_schedules', 'franchise_id', 'INT NULL'],
  ['package_service_schedules', 'source_job_cart_id', 'INT NULL'],
  ['package_service_schedules', 'job_cart_id', 'INT NULL'],
  // customer-app display controls for services
  ['services', 'show_in_app', 'TINYINT(1) NOT NULL DEFAULT 1'],
  ['services', 'is_featured', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['service_categories', 'show_on_home', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['service_categories', 'image_url', 'VARCHAR(500) NULL'],
  ['v2_audit_logs', 'ip_address', 'VARCHAR(64) NULL'],
  ['v2_payments', 'product_id', 'INT UNSIGNED NULL'],
  ['v2_pickup_requests', 'request_type', "VARCHAR(30) NOT NULL DEFAULT 'pickup'"],
  ['inventory', 'sub_category', 'VARCHAR(100) NULL'],
  ['inventory', 'brand', 'VARCHAR(100) NULL'],
  ['inventory', 'vehicle_compatibility', 'VARCHAR(255) NULL'],
  ['inventory', 'variant', 'VARCHAR(100) NULL'],
  ['inventory', 'price_visible_to_staff', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['inventory', 'discount_pct', 'DECIMAL(5,2) NOT NULL DEFAULT 0'],
  ['inventory', 'gst_pct', 'DECIMAL(5,2) NOT NULL DEFAULT 18'],
  ['inventory', 'supplier', 'VARCHAR(150) NULL'],
  ['inventory', 'purchase_date', 'DATE NULL'],
  ['inventory', 'purchase_invoice_no', 'VARCHAR(100) NULL'],
  ['inventory', 'warehouse_location', 'VARCHAR(150) NULL'],
  ['inventory', 'warranty', 'VARCHAR(100) NULL'],
  ['inventory', 'serial_number', 'VARCHAR(100) NULL'],
  ['inventory', 'expiry_date', 'DATE NULL'],
  // job cards
  ['job_carts', 'public_token', 'VARCHAR(40) NULL'],
  ['job_carts', 'car_category', 'VARCHAR(30) NULL'],
  ['job_carts', 'discount_approved_by', 'INT UNSIGNED NULL'],
  ['job_carts', 'referrer_type', "ENUM('staff','customer','external') NULL"],
  ['job_carts', 'referrer_user_id', 'INT UNSIGNED NULL'],
  ['job_carts', 'referrer_name', 'VARCHAR(150) NULL'],
  ['job_carts', 'referrer_mobile', 'VARCHAR(15) NULL'],
  ['job_carts', 'current_stage', 'VARCHAR(80) NULL'],
  // franchise geo (attendance geofence, delivery map centre)
  ['franchises', 'latitude', 'DECIMAL(10,7) NULL'],
  ['franchises', 'longitude', 'DECIMAL(10,7) NULL'],
  // salary method per staff member
  ['users', 'salary_type', "ENUM('monthly','daily','hourly') NOT NULL DEFAULT 'monthly'"],
  ['users', 'salary_rate', 'DECIMAL(10,2) NOT NULL DEFAULT 0'],
  ['users', 'working_days_per_month', 'TINYINT UNSIGNED NOT NULL DEFAULT 26'],
  ['users', 'paid_leaves_per_month', 'TINYINT UNSIGNED NOT NULL DEFAULT 1'],
  ['users', 'joining_date', 'DATE NULL'],
  // payroll detail
  ['staff_salary', 'franchise_id', 'INT UNSIGNED NOT NULL DEFAULT 1'],
  ['staff_salary', 'salary_type', 'VARCHAR(10) NULL'],
  ['staff_salary', 'salary_rate', 'DECIMAL(10,2) NOT NULL DEFAULT 0'],
  ['staff_salary', 'days_present', 'DECIMAL(5,1) NOT NULL DEFAULT 0'],
  ['staff_salary', 'half_days', 'DECIMAL(5,1) NOT NULL DEFAULT 0'],
  ['staff_salary', 'paid_leave_days', 'DECIMAL(5,1) NOT NULL DEFAULT 0'],
  ['staff_salary', 'unpaid_leave_days', 'DECIMAL(5,1) NOT NULL DEFAULT 0'],
  ['staff_salary', 'absent_days', 'DECIMAL(5,1) NOT NULL DEFAULT 0'],
  ['staff_salary', 'hours_worked', 'DECIMAL(7,2) NOT NULL DEFAULT 0'],
  ['staff_salary', 'incentive_amount', 'DECIMAL(10,2) NOT NULL DEFAULT 0'],
  ['staff_salary', 'referral_amount', 'DECIMAL(10,2) NOT NULL DEFAULT 0'],
  ['staff_salary', 'include_referral', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['staff_salary', 'payment_mode', 'VARCHAR(20) NULL'],
  ['staff_salary', 'paid_at', 'DATETIME NULL'],
  // HR
  ['staff_leaves', 'franchise_id', 'INT UNSIGNED NOT NULL DEFAULT 1'],
  ['staff_leaves', 'days_count', 'DECIMAL(4,1) NOT NULL DEFAULT 1'],
  ['staff_leaves', 'review_note', 'VARCHAR(255) NULL'],
  ['staff_tasks', 'franchise_id', 'INT UNSIGNED NOT NULL DEFAULT 1'],
  // feedback
  ['feedback', 'staff_rating', 'TINYINT UNSIGNED NULL'],
  ['feedback', 'quick_wash_id', 'INT UNSIGNED NULL'],
  ['v2_review_requests', 'franchise_id', 'INT UNSIGNED NOT NULL DEFAULT 1'],
  // inquiries = questions from customers (support); leads = new business
  ['inquiries', 'customer_id', 'INT UNSIGNED NULL'],
  ['inquiries', 'subject', 'VARCHAR(150) NULL'],
  ['inquiries', 'message', 'TEXT NULL'],
  ['inquiries', 'reply', 'TEXT NULL'],
  ['inquiries', 'replied_at', 'DATETIME NULL'],
  ['leads', 'email', 'VARCHAR(150) NULL'],
  ['leads', 'assigned_to', 'INT UNSIGNED NULL'],
  ['leads', 'next_follow_up_at', 'DATETIME NULL'],
  ['leads', 'direction', "ENUM('inbound','outbound') NOT NULL DEFAULT 'inbound'"],
  ['leads', 'score', 'TINYINT UNSIGNED NOT NULL DEFAULT 0'],
  ['leads', 'campaign', 'VARCHAR(100) NULL'],
  ['leads', 'lost_reason', 'VARCHAR(150) NULL'],
  // deliveries: GPS health + customer drop point
  ['deliveries', 'gps_status', 'VARCHAR(20) NULL'],
  ['deliveries', 'customer_lat', 'DECIMAL(10,8) NULL'],
  ['deliveries', 'customer_lng', 'DECIMAL(11,8) NULL'],
];

// Idempotent column changes
const MODIFY = [
  "ALTER TABLE staff_attendance MODIFY status ENUM('present','absent','half_day','leave') NOT NULL DEFAULT 'present'",
  'ALTER TABLE package_service_schedules MODIFY user_package_id INT UNSIGNED NULL',
  'ALTER TABLE payment_qrs MODIFY qr_image_url VARCHAR(500) NULL',
  "ALTER TABLE inquiries MODIFY source ENUM('staff','website','customer_app','whatsapp','instagram','facebook','walk_in','manual_intake') NOT NULL DEFAULT 'website'",
  "ALTER TABLE inquiries MODIFY status ENUM('new','followed_up','converted','open','answered','closed') NOT NULL DEFAULT 'new'",
  "ALTER TABLE leads MODIFY source VARCHAR(50) NULL DEFAULT 'whatsapp_inbound'",
];

// Sensible defaults: customers see the customer price only; staff see their staff price + customer price;
// franchise admins see the price HQ charges them (franchise price) + customer price. Cost price = HQ only.
const PRICE_VISIBILITY_DEFAULTS = {
  admin:    { cost_price: 0, franchise_price: 1, selling_price: 1, staff_price: 1 },
  manager:  { cost_price: 0, franchise_price: 0, selling_price: 1, staff_price: 1 },
  staff:    { cost_price: 0, franchise_price: 0, selling_price: 1, staff_price: 1 },
  customer: { cost_price: 0, franchise_price: 0, selling_price: 1, staff_price: 0 },
};

// Six car types (price tiers): hatchback, semi_sedan, sedan, premium_sedan, suv, premium_suv.
// Older data used medium_hatchback (premium hatchback) and luxury, plus upper-case codes for package prices.
async function migrateCarTypes(conn) {
  const { guessCarCategory } = require('../src/utils/carCategory');
  for (const table of ['services', 'packages']) {
    for (const [oldCol, newCol] of [['price_medium_hatchback', 'price_semi_sedan'], ['price_luxury', 'price_premium_suv']]) {
      const hasOld = await columnExists(conn, table, oldCol);
      const hasNew = await columnExists(conn, table, newCol);
      if (hasOld && !hasNew) {
        await conn.query(`ALTER TABLE \`${table}\` RENAME COLUMN \`${oldCol}\` TO \`${newCol}\``);
        console.log(`  [phase1] ${table}.${oldCol} → ${newCol}`);
      } else if (!hasNew) {
        await addColumn(conn, table, newCol, 'DECIMAL(10,2) NOT NULL DEFAULT 0');
      }
    }
  }
  // package price matrix: upper-case codes → the same six type keys
  const [[pp]] = await conn.query(
    "SELECT DATA_TYPE AS t FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'package_pricing' AND column_name = 'car_type'");
  if (pp && pp.t === 'enum') {
    await conn.query('ALTER TABLE package_pricing MODIFY car_type VARCHAR(30) NOT NULL');
    console.log('  [phase1] package_pricing.car_type → VARCHAR');
  }
  const codeMap = [['SMALL_HATCHBACK', 'hatchback'], ['MEDIUM_HATCHBACK', 'semi_sedan'], ['SEMI_SEDAN', 'semi_sedan'],
    ['SEDAN_SUV', 'sedan'], ['PREMIUM_SEDAN', 'premium_sedan'], ['LARGE_CAR', 'suv']];
  for (const [from, to] of codeMap) {
    await conn.query('UPDATE package_pricing SET car_type = ? WHERE car_type = ?', [to, from]);
    await conn.query('UPDATE package_requests SET car_type = ? WHERE car_type = ?', [to, from]);
  }
  const [[bk]] = await conn.query(
    "SELECT DATA_TYPE AS t FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'bookings' AND column_name = 'vehicle_category'");
  if (bk && bk.t === 'enum') await conn.query('ALTER TABLE bookings MODIFY vehicle_category VARCHAR(30) NULL');
  // saved car types: premium hatchbacks are hatchbacks, luxury cars are re-read from the model
  const [old] = await conn.query("SELECT id, brand, model, category FROM vehicles WHERE category IN ('medium_hatchback', 'luxury')");
  for (const v of old) {
    const t = guessCarCategory(v.brand, v.model) || (v.category === 'luxury' ? 'premium_suv' : 'hatchback');
    await conn.query('UPDATE vehicles SET category = ? WHERE id = ?', [t, v.id]);
  }
  for (const [table, col] of [['job_carts', 'car_category'], ['bookings', 'vehicle_category'], ['manual_bills', 'vehicle_category']]) {
    if (!(await columnExists(conn, table, col))) continue;
    await conn.query(`UPDATE \`${table}\` SET \`${col}\` = 'hatchback' WHERE \`${col}\` = 'medium_hatchback'`);
    await conn.query(`UPDATE \`${table}\` SET \`${col}\` = 'premium_suv' WHERE \`${col}\` = 'luxury'`);
  }
}

async function runPhase1Schema(pool) {
  const conn = await pool.getConnection();
  try {
    for (const ddl of TABLES) await conn.query(ddl);
    for (const [t, c, d] of COLUMNS) await addColumn(conn, t, c, d);
    for (const ddl of MODIFY) await conn.query(ddl);
    await migrateCarTypes(conn);

    for (const [role, fields] of Object.entries(PRICE_VISIBILITY_DEFAULTS)) {
      for (const [field, visible] of Object.entries(fields)) {
        await conn.query('INSERT IGNORE INTO price_visibility (role, price_field, is_visible) VALUES (?, ?, ?)', [role, field, visible]);
      }
    }

    // Settings must be unique per franchise (not globally) so every new franchise gets its own values
    if (await indexExists(conn, 'settings', 'uq_key_name')) {
      await conn.query('ALTER TABLE settings DROP INDEX uq_key_name');
      console.log('  [phase1] settings: dropped global unique key');
    }
    if (!(await indexExists(conn, 'settings', 'uq_franchise_key'))) {
      await conn.query('UPDATE settings SET franchise_id = 1 WHERE franchise_id IS NULL');
      await conn.query('ALTER TABLE settings ADD UNIQUE KEY uq_franchise_key (franchise_id, key_name)');
      console.log('  [phase1] settings: unique (franchise_id, key_name)');
    }

    // Unguessable public tracking token per job card (used in WhatsApp tracking links)
    await conn.query("UPDATE job_carts SET public_token = REPLACE(UUID(), '-', '') WHERE public_token IS NULL");
    if (!(await indexExists(conn, 'job_carts', 'uq_public_token'))) {
      await conn.query('ALTER TABLE job_carts ADD UNIQUE KEY uq_public_token (public_token)');
    }
    // Anand studio (GIDC Vitthal Udyognagar) — editable per franchise by the Super Admin
    await conn.query('UPDATE franchises SET latitude = 22.5373, longitude = 72.9295 WHERE id = 1 AND latitude IS NULL');
    await conn.query("UPDATE users SET salary_rate = base_salary WHERE role IN ('staff','manager') AND salary_rate = 0 AND base_salary > 0");

    if (module.exports.extraSteps) {
      for (const step of module.exports.extraSteps) await step(conn, { addColumn, columnExists, indexExists });
    }
  } finally {
    conn.release();
  }

  const { syncFeatureCatalogToDb } = require('../src/config/featureCatalog');
  await syncFeatureCatalogToDb(pool);
}

module.exports = { runPhase1Schema, addColumn, columnExists, indexExists, extraSteps: [] };

if (require.main === module) {
  const pool = require('../src/config/db');
  runPhase1Schema(pool)
    .then(() => { console.log('Phase 1 schema ready'); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
}
