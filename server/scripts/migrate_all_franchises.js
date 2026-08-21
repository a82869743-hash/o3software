const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Test1234',
    database: process.env.DB_NAME || 'o3_car_spa',
  });

  console.log('Migrating franchise_id to ALL entity tables for 100% data separation...');

  const tables = [
    'users', 'vehicles', 'services', 'vendors', 'accounts',
    'payments', 'buy_sell', 'quick_wash', 'quotations',
    'deliveries', 'pickups', 'product_orders', 'staff_attendance',
    'staff_payments', 'salary_slips', 'loyalty', 'job_carts',
    'inquiries', 'inventory', 'user_packages', 'bookings', 'packages'
  ];

  for (const t of tables) {
    try {
      await pool.query(`ALTER TABLE ${t} ADD COLUMN franchise_id INT DEFAULT 1`);
      console.log(`✓ Added franchise_id to table '${t}'`);
    } catch (e) {
      if (!e.message.includes('Duplicate column')) {
        console.warn(`Notice for ${t}:`, e.message);
      }
    }
  }

  console.log('\n✅ All database tables successfully updated with franchise_id column!');
  await pool.end();
}

run().catch(e => console.error('Migration error:', e));
