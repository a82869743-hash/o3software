const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

async function run() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Test1234',
    database: process.env.DB_NAME || 'o3_car_spa',
  });

  console.log('Migrating franchises table...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS franchises (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      code VARCHAR(50) UNIQUE NOT NULL,
      address VARCHAR(255),
      phone VARCHAR(50),
      is_active TINYINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    INSERT INTO franchises (id, name, code, address, phone) VALUES
      (1, 'O3 Car Spa - Main Studio', 'o3_main', 'Plot No. 37, Zone D5, GIDC, Anand', '7225030303'),
      (2, 'O3 Lite - Express Studio', 'o3_lite', 'Station Road, Anand', '7225030304')
    ON DUPLICATE KEY UPDATE name = VALUES(name);
  `);
  console.log('✓ Franchises table seeded');

  const tables = ['job_carts', 'inquiries', 'inventory', 'user_packages', 'bookings'];
  for (const t of tables) {
    try {
      await pool.query(`ALTER TABLE ${t} ADD COLUMN franchise_id INT DEFAULT 1`);
      console.log(`✓ Added franchise_id to ${t}`);
    } catch(e) {
      if (!e.message.includes('Duplicate column')) console.error(`Notice for ${t}:`, e.message);
    }
  }

  console.log('✅ Franchise DB Migration Completed Successfully');
  await pool.end();
}

run().catch(e => console.error('Migration failed:', e));
