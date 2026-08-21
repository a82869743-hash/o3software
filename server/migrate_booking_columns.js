/**
 * Ensure bookings table has columns needed for package booking flow.
 * Safe to run multiple times — skips columns that already exist.
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'o3_car_spa',
  });

  const columns = [
    { name: 'booking_type', definition: "ENUM('direct','package') DEFAULT 'direct'" },
    { name: 'user_package_id', definition: 'INT UNSIGNED DEFAULT NULL' },
    { name: 'package_service_name', definition: 'VARCHAR(255) DEFAULT NULL' },
  ];

  for (const col of columns) {
    try {
      await pool.query(`ALTER TABLE bookings ADD COLUMN ${col.name} ${col.definition}`);
      console.log(`[MIGRATION] Added column: ${col.name}`);
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log(`[MIGRATION] Column already exists: ${col.name}`);
      } else {
        console.error(`[MIGRATION] Error adding ${col.name}:`, e.message);
      }
    }
  }

  // Also ensure package_requests table exists (for approval workflow)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS package_requests (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        customer_id INT UNSIGNED NOT NULL,
        vehicle_id INT UNSIGNED NOT NULL,
        package_id INT UNSIGNED NOT NULL,
        price DECIMAL(10,2) DEFAULT 0,
        status ENUM('pending','approved','rejected') DEFAULT 'pending',
        rejection_reason TEXT DEFAULT NULL,
        approved_at DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES users(id),
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
        FOREIGN KEY (package_id) REFERENCES packages(id)
      )
    `);
    console.log('[MIGRATION] package_requests table ensured');
  } catch (e) {
    console.log('[MIGRATION] package_requests:', e.message);
  }

  await pool.end();
  console.log('[MIGRATION] Done.');
  process.exit(0);
}

migrate();
