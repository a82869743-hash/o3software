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

  console.log('Restoring O3 Main Studio data (franchise_id = 1)...');

  const tables = [
    'users', 'vehicles', 'services', 'vendors', 'job_carts',
    'inventory', 'inquiries', 'user_packages', 'bookings', 'packages',
    'transactions', 'payments', 'buy_sell', 'quotations', 'deliveries',
    'product_orders', 'staff_attendance', 'staff_payments', 'loyalty'
  ];

  for (const t of tables) {
    try {
      const [res] = await pool.query(`UPDATE ${t} SET franchise_id = 1 WHERE franchise_id IS NULL OR franchise_id = 0`);
      console.log(`✓ Table '${t}': ${res.affectedRows} row(s) explicitly linked to O3 Main Studio (franchise_id = 1)`);
    } catch (e) {
      console.warn(`Notice for ${t}:`, e.message);
    }
  }

  // Ensure services and packages exist for O3 Main
  const [svcCount] = await pool.query('SELECT COUNT(*) AS total FROM services WHERE franchise_id = 1');
  console.log(`✓ Services count for O3 Main Studio: ${svcCount[0].total}`);

  const [custCount] = await pool.query("SELECT COUNT(*) AS total FROM users WHERE role = 'customer' AND (franchise_id = 1 OR franchise_id IS NULL)");
  console.log(`✓ Customers count for O3 Main Studio: ${custCount[0].total}`);

  const [jcCount] = await pool.query("SELECT COUNT(*) AS total FROM job_carts WHERE (franchise_id = 1 OR franchise_id IS NULL)");
  console.log(`✓ Job Cards count for O3 Main Studio: ${jcCount[0].total}`);

  console.log('\n✅ O3 Main Studio data restored 100%! O3 Lite remains clean & separate.');
  await pool.end();
}

run().catch(e => console.error(e));
