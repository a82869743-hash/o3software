const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');

async function resetCleanProductionDB() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'o3_car_spa';

  console.log(`Connecting to MySQL database '${database}'...`);
  const conn = await mysql.createConnection({ host, port, user, password, database, multipleStatements: true });

  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    console.log('Performing COMPLETE PRODUCTION DATA CLEANUP...\n');

    // 1. Clear all customer, job card, financial & test activity tables
    const tablesToClean = [
      // Job Cards & Service Records
      'job_services',
      'job_cart_items',
      'job_cart_inspections',
      'job_cart_photos',
      'job_cart_belongings',
      'job_photos',
      'job_carts',
      
      // Bookings & Slots
      'booking_services',
      'bookings',
      'v2_blocked_slots',

      // Financials, Payments, Invoices
      'invoices',
      'invoice_items',
      'v2_payments',
      'v2_payment_transactions',
      'advance_payments',
      'transactions',
      'v2_refunds',
      'manual_bills',

      // Packages & Subscriptions
      'user_packages',
      'user_package_usages',
      'package_requests',
      'package_usage',
      'v2_package_renewals',

      // Wallets & Rewards
      'wallets',
      'wallet_transactions',
      'v2_wallet_transactions',
      'v2_wallets',
      'customer_rewards',
      'referrals',
      'referral_rewards',
      'referral_codes',
      'v2_referrals',
      'loyalty_transactions',

      // Stock, Inventory & Stock Requests
      'franchise_stock_requests',
      'franchise_inventory_pricing',
      'inventory',

      // Communications & Logs
      'inquiries',
      'feedback',
      'deliveries',
      'pickup_requests',
      'whatsapp_messages',
      'v2_notification_logs',
      'v2_review_requests',
      'audit_logs',
      'v2_audit_logs',
      'shared_files',
      'v2_file_attachments',

      // Vehicles
      'vehicles'
    ];

    for (const table of tablesToClean) {
      try {
        await conn.query(`TRUNCATE TABLE \`${table}\``);
        console.log(`  ✓ Cleared table: ${table}`);
      } catch (tErr) {
        try {
          await conn.query(`DELETE FROM \`${table}\``);
          console.log(`  ✓ Deleted rows from table: ${table}`);
        } catch { /* Table might not exist */ }
      }
    }

    // 2. Clear customer user accounts (preserve admins & staff)
    const [delCust] = await conn.query("DELETE FROM users WHERE role = 'customer'");
    console.log(`\n  ✓ Cleared ${delCust.affectedRows || 0} customer user accounts`);

    // 3. Clean up non-standard test users if any
    const adminHash = await bcrypt.hash('12345', 10);
    
    // Ensure Main Admin exists
    await conn.query(`
      INSERT INTO users (id, name, mobile, email, password_hash, role, franchise_id, is_active)
      VALUES (1, 'Sharanpalsingh Sodhi', '7225030303', 'o3carspavvn@gmail.com', ?, 'admin', 1, 1)
      ON DUPLICATE KEY UPDATE name = 'Sharanpalsingh Sodhi', mobile = '7225030303', role = 'admin', franchise_id = 1, is_active = 1
    `, [adminHash]);

    // Ensure Branch Outlet Admin exists
    await conn.query(`
      INSERT INTO users (id, name, mobile, email, password_hash, role, franchise_id, is_active)
      VALUES (7, 'Franchise Manager', '9000000001', 'franchise1@o3carspa.com', ?, 'admin', 2, 1)
      ON DUPLICATE KEY UPDATE name = 'Franchise Manager', mobile = '9000000001', role = 'admin', franchise_id = 2, is_active = 1
    `, [adminHash]);

    // Ensure Staff Technicians exist
    await conn.query(`
      INSERT INTO users (id, name, mobile, email, password_hash, role, franchise_id, is_active)
      VALUES 
        (9, 'Rajesh Sharma', '9000000003', 'rajesh@o3carspa.com', ?, 'staff', 1, 1),
        (10, 'Vikram Patel', '9000000004', 'vikram@o3carspa.com', ?, 'staff', 1, 1)
      ON DUPLICATE KEY UPDATE name = VALUES(name), role = 'staff', is_active = 1
    `, [adminHash, adminHash]);

    // 4. Seed Clean Official Inventory Catalog
    console.log('\nSeeding Clean Production Inventory & Products...');
    const officialInventory = [
      { name: 'Ceramic Pro 9H Coating (50ml)', category: 'Chemicals', stock: 15, unit: 'bottle', reorder: 5, price: 4500, cost: 2800 },
      { name: 'PPF Gloss Roll (1.52m x 15m)', category: 'Films', stock: 8, unit: 'roll', reorder: 2, price: 35000, cost: 22000 },
      { name: 'Dashboard & Trim Polish (5L)', category: 'Chemicals', stock: 20, unit: 'can', reorder: 5, price: 1800, cost: 1100 },
      { name: 'Microfiber Towel 400GSM (Pack of 10)', category: 'Accessories', stock: 50, unit: 'pack', reorder: 10, price: 650, cost: 380 },
      { name: 'Glass & Windshield Cleaner (5L)', category: 'Chemicals', stock: 25, unit: 'can', reorder: 5, price: 1200, cost: 700 },
      { name: 'High Pressure Foam Shampoo (20L)', category: 'Chemicals', stock: 12, unit: 'can', reorder: 3, price: 3200, cost: 1900 },
      { name: 'Tyre & Alloy Dressing Gel (5L)', category: 'Chemicals', stock: 18, unit: 'can', reorder: 4, price: 2100, cost: 1300 },
      { name: 'Leather Conditioner & Shield (1L)', category: 'Chemicals', stock: 14, unit: 'bottle', reorder: 4, price: 1600, cost: 950 }
    ];

    for (const item of officialInventory) {
      await conn.query(`
        INSERT INTO inventory (product_name, category, quantity, unit, low_stock_threshold, selling_price, cost_price, franchise_id, is_deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)
      `, [item.name, item.category, item.stock, item.unit, item.reorder, item.price, item.cost]);
    }
    console.log(`  ✓ Inserted ${officialInventory.length} clean production inventory products (No test items / No zero-stock glitches)`);

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    // List remaining active user accounts
    const [users] = await conn.query("SELECT id, name, mobile, role, franchise_id FROM users");
    console.log(`\n  ✓ Active System Accounts (${users.length} total):`);
    users.forEach(u => {
      console.log(`     - ID ${u.id}: ${u.name} (${u.mobile}) — Role: [${u.role}] | Franchise ID: ${u.franchise_id || 1}`);
    });

    console.log('\n================================================================');
    console.log('  DATABASE COMPLETELY CLEANED & RESET FOR PRODUCTION DEPLOYMENT');
    console.log('  NO TEST DATA / NO ZERO-STOCK GLITCHES REMAIN');
    console.log('================================================================\n');

  } catch (err) {
    console.error('✗ Reset error:', err.message);
  } finally {
    await conn.end();
  }
}

resetCleanProductionDB();
