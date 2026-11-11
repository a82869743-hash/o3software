/**
 * ═══════════════════════════════════════════════════════════
 * [DEPRECATED / SUPERSEDED] DATABASE MIGRATION SCRIPT
 * ═══════════════════════════════════════════════════════════
 * 
 * NOTE: Schema definitions in this standalone script are now
 * fully included in standard migration file:
 * server/migrations/072_vendor_gst_purchases_v2.sql
 * 
 * Standard runner (`node server/scripts/migrate.js`) handles table creation.
 * This file is retained for backwards compatibility only.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');

async function runStartupMigrations(existingPool) {
  const isInternalPool = !existingPool;
  const pool = existingPool || mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'o3_car_spa',
    waitForConnections: true,
    connectionLimit: 5,
    multipleStatements: true,
  });

  let conn;
  try {
    conn = await pool.getConnection();
  } catch (connErr) {
    console.warn('[MIGRATIONS] Database connection pending, will retry on next connection:', connErr.message);
    if (isInternalPool) await pool.end().catch(() => {});
    return;
  }

  try {
    console.log('═══════════════════════════════════════════');
    console.log('  DATABASE MIGRATION — Adding Missing Columns');
    console.log('═══════════════════════════════════════════\n');

    // Helper: safely add a column if it doesn't exist
    async function addColumnIfNotExists(table, column, definition) {
      try {
        const [cols] = await conn.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
          [process.env.DB_NAME, table, column]
        );
        if (cols.length === 0) {
          await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
          console.log(`  ✅ Added column: ${table}.${column}`);
        } else {
          console.log(`  ⏭  Column already exists: ${table}.${column}`);
        }
      } catch (err) {
        console.warn(`  ⚠  Failed to add ${table}.${column}: ${err.message}`);
      }
    }

    // Helper: safely create a table if it doesn't exist
    async function createTableIfNotExists(tableName, createSQL) {
      try {
        const [tables] = await conn.query(
          `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
          [process.env.DB_NAME, tableName]
        );
        if (tables.length === 0) {
          await conn.query(createSQL);
          console.log(`  ✅ Created table: ${tableName}`);
        } else {
          console.log(`  ⏭  Table already exists: ${tableName}`);
        }
      } catch (err) {
        console.warn(`  ⚠  Failed to create ${tableName}: ${err.message}`);
      }
    }

    // ─── packages table ───────────────────────────────
    console.log('\n📦 Migrating: packages table');
    await addColumnIfNotExists('packages', 'package_validity', 'INT DEFAULT 12 COMMENT "Duration in months"');
    await addColumnIfNotExists('packages', 'paid_wash_count', 'INT DEFAULT 0');
    await addColumnIfNotExists('packages', 'sort_order', 'INT DEFAULT 0');
    await addColumnIfNotExists('packages', 'is_active', 'TINYINT(1) DEFAULT 1');
    await addColumnIfNotExists('packages', 'is_custom', 'TINYINT(1) DEFAULT 0');
    await addColumnIfNotExists('packages', 'is_published', 'TINYINT(1) DEFAULT 1');
    await addColumnIfNotExists('packages', 'visible_to_customer', 'TINYINT(1) DEFAULT 1');

    // ─── user_packages table ──────────────────────────
    console.log('\n👤 Migrating: user_packages table');
    await addColumnIfNotExists('user_packages', 'pricing_type', "VARCHAR(50) DEFAULT 'basic'");
    await addColumnIfNotExists('user_packages', 'car_type', 'VARCHAR(50) DEFAULT NULL');
    await addColumnIfNotExists('user_packages', 'start_date', 'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP');

    // ─── package_services table ───────────────────────
    console.log('\n🔧 Migrating: package_services table');
    await addColumnIfNotExists('package_services', 'complimentary', 'TINYINT(1) DEFAULT 0');
    await addColumnIfNotExists('package_services', 'display_order', 'INT DEFAULT 0');

    // ─── inventory table ──────────────────────────────
    console.log('\n📦 Migrating: inventory table');
    await addColumnIfNotExists('inventory', 'status', "VARCHAR(50) DEFAULT 'active'");
    await addColumnIfNotExists('inventory', 'is_deleted', 'TINYINT(1) DEFAULT 0');
    await addColumnIfNotExists('inventory', 'selling_price', 'DECIMAL(10,2) DEFAULT 0');
    await addColumnIfNotExists('inventory', 'cost_price', 'DECIMAL(10,2) DEFAULT 0');
    await addColumnIfNotExists('inventory', 'images_json', 'TEXT DEFAULT NULL');

    // ─── slots table ──────────────────────────────────
    console.log('\n📅 Migrating: slots table');
    await addColumnIfNotExists('slots', 'is_deleted', 'TINYINT DEFAULT 0');

    // ─── v2_gst_records table ─────────────────────────
    console.log('\n📊 Migrating: v2_gst_records table');
    await createTableIfNotExists('v2_gst_records', `
      CREATE TABLE v2_gst_records (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        record_type VARCHAR(50) DEFAULT 'sales',
        gstin VARCHAR(20) DEFAULT NULL,
        taxable_amount DECIMAL(12,2) DEFAULT 0,
        cgst DECIMAL(10,2) DEFAULT 0,
        sgst DECIMAL(10,2) DEFAULT 0,
        igst DECIMAL(10,2) DEFAULT 0,
        total_gst DECIMAL(10,2) DEFAULT 0,
        period_month INT DEFAULT NULL,
        period_year INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ─── v2_package_renewals table ────────────────────
    console.log('\n🔄 Migrating: v2_package_renewals table');
    await createTableIfNotExists('v2_package_renewals', `
      CREATE TABLE v2_package_renewals (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        customer_id INT UNSIGNED NOT NULL,
        package_id INT UNSIGNED NOT NULL,
        customer_package_id INT UNSIGNED DEFAULT NULL,
        renewal_date DATE DEFAULT NULL,
        amount_paid DECIMAL(10,2) DEFAULT 0,
        payment_id INT UNSIGNED DEFAULT NULL,
        renewed_by VARCHAR(50) DEFAULT 'customer',
        notes TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ─── v2_audit_logs table ──────────────────────────
    console.log('\n📝 Migrating: v2_audit_logs table');
    await createTableIfNotExists('v2_audit_logs', `
      CREATE TABLE v2_audit_logs (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id INT UNSIGNED DEFAULT NULL,
        user_type VARCHAR(50) DEFAULT NULL,
        action VARCHAR(100) DEFAULT NULL,
        resource VARCHAR(100) DEFAULT NULL,
        resource_id INT UNSIGNED DEFAULT NULL,
        old_value JSON DEFAULT NULL,
        new_value JSON DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ─── package_products table ───────────────────────
    console.log('\n📦 Migrating: package_products table');
    await createTableIfNotExists('package_products', `
      CREATE TABLE package_products (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        package_id INT UNSIGNED NOT NULL,
        product_id INT UNSIGNED NOT NULL,
        quantity INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ─── package_pricing table ────────────────────────
    console.log('\n💰 Migrating: package_pricing table');
    await createTableIfNotExists('package_pricing', `
      CREATE TABLE package_pricing (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        package_id INT UNSIGNED NOT NULL,
        car_type VARCHAR(50) DEFAULT NULL,
        pricing_type VARCHAR(50) DEFAULT 'basic',
        price DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ─── package_requests table ───────────────────────
    console.log('\n📋 Migrating: package_requests table');
    await createTableIfNotExists('package_requests', `
      CREATE TABLE package_requests (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        customer_id INT UNSIGNED NOT NULL,
        vehicle_id INT UNSIGNED DEFAULT NULL,
        package_id INT UNSIGNED NOT NULL,
        price DECIMAL(10,2) DEFAULT 0,
        pricing_type VARCHAR(50) DEFAULT 'basic',
        car_type VARCHAR(50) DEFAULT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        rejection_reason TEXT DEFAULT NULL,
        approved_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ─── product_orders table ─────────────────────────
    console.log('\n🛒 Migrating: product_orders table');
    await createTableIfNotExists('product_orders', `
      CREATE TABLE product_orders (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        customer_id INT UNSIGNED NOT NULL,
        product_id INT UNSIGNED NOT NULL,
        quantity INT DEFAULT 1,
        unit_price DECIMAL(10,2) DEFAULT 0,
        total_amount DECIMAL(10,2) DEFAULT 0,
        payment_method VARCHAR(50) DEFAULT NULL,
        payment_status VARCHAR(50) DEFAULT 'pending',
        razorpay_order_id VARCHAR(100) DEFAULT NULL,
        razorpay_payment_id VARCHAR(100) DEFAULT NULL,
        razorpay_signature VARCHAR(255) DEFAULT NULL,
        qr_transaction_id VARCHAR(100) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ─── Discount Reason & Reference Columns ─────────────────
    console.log('\n📝 Migrating: Discount Reason & Reference Columns');
    await addColumnIfNotExists('job_carts', 'discount_reason', 'VARCHAR(255) DEFAULT NULL');
    await addColumnIfNotExists('job_carts', 'discount_reference', 'VARCHAR(255) DEFAULT NULL');
    await addColumnIfNotExists('manual_bills', 'discount_reason', 'VARCHAR(255) DEFAULT NULL');
    await addColumnIfNotExists('manual_bills', 'discount_reference', 'VARCHAR(255) DEFAULT NULL');

    // ─── Partial PPF Custom Price & Notes ─────────────────────
    console.log('\n✨ Migrating: Partial PPF Custom Fields');
    await addColumnIfNotExists('job_services', 'custom_price', 'DECIMAL(10,2) DEFAULT NULL');
    await addColumnIfNotExists('job_services', 'custom_notes', 'VARCHAR(255) DEFAULT NULL');

    // ─── Slot Closures & Holidays ────────────────────────────
    console.log('\n📅 Migrating: slot_closures table');
    await createTableIfNotExists('slot_closures', `
      CREATE TABLE slot_closures (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        franchise_id INT DEFAULT 1,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        slot_time VARCHAR(50) DEFAULT NULL,
        reason VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ─── Job Card Live Progress Stages ───────────────────────
    console.log('\n🚀 Migrating: job_card_stages table');
    await createTableIfNotExists('job_card_stages', `
      CREATE TABLE job_card_stages (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        job_cart_id INT UNSIGNED NOT NULL,
        stage_name VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        notes TEXT DEFAULT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_job_cart (job_cart_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ─── Customer Rewards Table ──────────────────────────────
    console.log('\n🎁 Migrating: customer_rewards table');
    await createTableIfNotExists('customer_rewards', `
      CREATE TABLE customer_rewards (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        reward_type ENUM('welcome', 'first_service', 'birthday', 'referral_bonus', 'loyalty_milestone') NOT NULL,
        points_awarded INT NOT NULL DEFAULT 0,
        discount_pct DECIMAL(5,2) DEFAULT NULL,
        description VARCHAR(255),
        redeemed TINYINT(1) DEFAULT 0,
        redeemed_at TIMESTAMP NULL,
        expires_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_customer (customer_id),
        INDEX idx_type (reward_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ─── Franchise Stock Requests & Pricing ──────────────────
    console.log('\n🏬 Migrating: franchise_stock_requests & pricing tables');
    await createTableIfNotExists('franchise_inventory_pricing', `
      CREATE TABLE franchise_inventory_pricing (
        id INT AUTO_INCREMENT PRIMARY KEY,
        inventory_id INT NOT NULL,
        franchise_id INT NOT NULL,
        franchise_price DECIMAL(10,2) DEFAULT NULL,
        selling_price DECIMAL(10,2) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_inv_fran (inventory_id, franchise_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await createTableIfNotExists('franchise_stock_requests', `
      CREATE TABLE franchise_stock_requests (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        franchise_id INT NOT NULL,
        product_id INT UNSIGNED NULL,
        product_name VARCHAR(255) NOT NULL,
        requested_quantity INT UNSIGNED NOT NULL DEFAULT 1,
        unit VARCHAR(50) DEFAULT 'pcs',
        estimated_price DECIMAL(10,2) DEFAULT NULL,
        notes TEXT NULL,
        status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
        rejection_reason VARCHAR(255) NULL,
        approved_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_franchise_req (franchise_id),
        INDEX idx_req_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ─── Multi-franchise & Core Missing Columns ────────────────
    console.log('\n🏢 Migrating: Multi-franchise & Core Columns');
    await addColumnIfNotExists('transactions', 'franchise_id', 'INT NULL DEFAULT 1');
    await addColumnIfNotExists('deliveries', 'franchise_id', 'INT NULL DEFAULT 1');
    await addColumnIfNotExists('staff_payments', 'franchise_id', 'INT NULL DEFAULT 1');
    await addColumnIfNotExists('package_requests', 'franchise_id', 'INT NULL DEFAULT 1');
    await addColumnIfNotExists('product_orders', 'franchise_id', 'INT NULL DEFAULT 1');
    await addColumnIfNotExists('services', 'franchise_id', 'INT NULL DEFAULT NULL');
    await addColumnIfNotExists('slots', 'is_deleted', 'TINYINT DEFAULT 0');
    await addColumnIfNotExists('job_carts', 'total_amount', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00');
    await addColumnIfNotExists('vendors', 'franchise_id', 'INT NULL DEFAULT 1');
    await addColumnIfNotExists('bookings', 'booking_type', "VARCHAR(50) DEFAULT 'direct'");
    await addColumnIfNotExists('bookings', 'user_package_id', 'INT NULL');
    await addColumnIfNotExists('bookings', 'package_service_name', 'VARCHAR(255) NULL');
    await addColumnIfNotExists('bookings', 'pickup_type', "VARCHAR(50) DEFAULT 'none'");
    await addColumnIfNotExists('bookings', 'pickup_charge', 'DECIMAL(10,2) DEFAULT 0.00');
    await addColumnIfNotExists('vehicles', 'category', "VARCHAR(50) DEFAULT 'sedan'");
    await addColumnIfNotExists('users', 'profile_picture', 'VARCHAR(255) NULL');



    console.log('\n═══════════════════════════════════════════');

    console.log('  ✅ Migration completed successfully!');
    console.log('═══════════════════════════════════════════\n');

  } catch (err) {
    console.error('\n❌ Migration notice:', err.message);
  } finally {
    if (conn) conn.release();
    if (isInternalPool) await pool.end().catch(() => {});
  }
}

module.exports = { runStartupMigrations };

if (require.main === module) {
  runStartupMigrations().then(() => process.exit(0)).catch(() => process.exit(1));
}
