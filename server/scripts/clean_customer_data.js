const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function cleanCustomerData() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'o3_car_spa';

  console.log(`Connecting to MySQL database '${database}'...`);
  const conn = await mysql.createConnection({ host, port, user, password, database, multipleStatements: true });
  
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    console.log('Cleaning customer-related test data...\n');

    const customerTables = [
      'job_services',
      'job_cart_items',
      'job_cart_inspections',
      'job_cart_photos',
      'job_cart_belongings',
      'job_carts',
      'booking_services',
      'bookings',
      'invoices',
      'invoice_items',
      'v2_payments',
      'v2_payment_transactions',
      'advance_payments',
      'transactions',
      'v2_refunds',
      'manual_bills',
      'user_packages',
      'user_package_usages',
      'package_requests',
      'wallets',
      'wallet_transactions',
      'v2_wallet_transactions',
      'v2_wallets',
      'customer_rewards',
      'referrals',
      'referral_rewards',
      'referral_codes',
      'v2_referrals',
      'inquiries',
      'feedback',
      'deliveries',
      'pickup_requests',
      'whatsapp_messages',
      'v2_notification_logs',
      'shared_files',
      'vehicles'
    ];

    for (const table of customerTables) {
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

    // Delete customer users only (preserve admins & staff)
    const [delCustResult] = await conn.query("DELETE FROM users WHERE role = 'customer'");
    console.log(`\n  ✓ Cleared ${delCustResult.affectedRows || 0} test customer accounts`);

    // Verify remaining admin/staff accounts
    const [remainingUsers] = await conn.query("SELECT id, name, mobile, role FROM users");
    console.log(`\n  ✓ Preserved Admin & Staff Accounts (${remainingUsers.length} total):`);
    remainingUsers.forEach(u => {
      console.log(`     - ID ${u.id}: ${u.name} (${u.mobile}) — Role: [${u.role}]`);
    });

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('\n======================================================');
    console.log('  ALL TEST CUSTOMER DATA CLEARED SUCCESSFULLY!');
    console.log('  DATABASE CLEAN & READY FOR FRESH PRODUCTION DEPLOYMENT');
    console.log('======================================================\n');

  } catch (err) {
    console.error('✗ Cleanup error:', err.message);
  } finally {
    await conn.end();
  }
}

cleanCustomerData();
