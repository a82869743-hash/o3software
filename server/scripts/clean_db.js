const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function cleanDatabase() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'o3_car_spa';

  console.log(`Connecting to MySQL database '${database}' at ${host}:${port}...`);

  let conn;
  try {
    conn = await mysql.createConnection({ host, port, user, password, database, multipleStatements: true });
    console.log('✓ Connected successfully.\n');

    console.log('Cleaning all contents from database tables...');
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    const tablesToClean = [
      'whatsapp_messages',
      'v2_notification_logs',
      'v2_wallet_transactions',
      'v2_wallets',
      'v2_referrals',
      'referral_rewards',
      'referral_codes',
      'customer_rewards',
      'staff_attendance',
      'staff_profiles',
      'salary_payouts',
      'vendor_purchases',
      'purchase_bills',
      'shared_files',
      'job_services',
      'job_carts',
      'booking_services',
      'bookings',
      'v2_blocked_slots',
      'loyalty',
      'vehicles',
      'users'
    ];

    for (const table of tablesToClean) {
      try {
        await conn.query(`TRUNCATE TABLE \`${table}\``);
        console.log(`  ✓ Cleared table: ${table}`);
      } catch (tErr) {
        // Fallback to DELETE if TRUNCATE fails on foreign key reference
        try {
          await conn.query(`DELETE FROM \`${table}\``);
          console.log(`  ✓ Deleted rows from table: ${table}`);
        } catch { /* Table might not exist yet */ }
      }
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('\n✓ Database content cleared successfully.');

    // ─── Seed Solo Admin for O3 Car Spaa ─────────────────────────
    console.log('\nSeeding O3 Car Spaa Solo Admin...');
    const adminHash = await bcrypt.hash('12345', 10);

    const [adminResult] = await conn.query(`
      INSERT INTO users (name, mobile, email, password_hash, role, is_active)
      VALUES ('Sharanpalsingh Sodhi', '7225030303', 'o3carspavvn@gmail.com', ?, 'admin', 1)
    `, [adminHash]);

    console.log(`✓ Solo Admin Created!`);
    console.log(`  - Name:     Sharanpalsingh Sodhi`);
    console.log(`  - Mobile:   7225030303`);
    console.log(`  - Email:    o3carspavvn@gmail.com`);
    console.log(`  - Password: 12345`);
    console.log(`  - Role:     admin (ID: ${adminResult.insertId})`);

    // ─── Seed Initial Settings for O3 Car Spaa ───────────────────
    await conn.query(`
      INSERT INTO settings (key_name, value) VALUES
        ('studio_name', 'O3 Car Spaa'),
        ('tagline', 'Premium Car Detailing Studio'),
        ('mobile', '7225030303'),
        ('email', 'o3carspavvn@gmail.com'),
        ('address', 'Plot No. 37, Zone No. D5, Opp. Bank of Baroda, GIDC, Vitthal Udyognagar, Anand, Gujarat (388121)'),
        ('upi_id', '7225030303@paytm'),
        ('upi_number', '7225030303'),
        ('upi_name', 'O3 Car Spaa')
      ON DUPLICATE KEY UPDATE value = VALUES(value)
    `);
    console.log('  ✓ Initial O3 Car Spaa settings configured');

    await conn.end();
    console.log('\n=============================================');
    console.log('  DATABASE CLEANED & O3 CAR SPAA ADMIN READY');
    console.log('=============================================\n');

  } catch (err) {
    console.error('✗ Error cleaning database:', err.message);
    if (conn) await conn.end();
  }
}

cleanDatabase();
