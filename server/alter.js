const mysql = require('mysql2/promise');

async function main() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'o3_car_spa',
  });

  try {
    await pool.query("ALTER TABLE bookings ADD COLUMN booking_type ENUM('direct', 'package') DEFAULT 'direct'");
    console.log('Added booking_type');
  } catch (e) {
    console.error(e.message);
  }

  try {
    await pool.query("ALTER TABLE bookings ADD COLUMN user_package_id INT UNSIGNED DEFAULT NULL");
    console.log('Added user_package_id');
  } catch (e) {
    console.error(e.message);
  }

  try {
    await pool.query("ALTER TABLE bookings ADD COLUMN package_service_name VARCHAR(255) DEFAULT NULL");
    console.log('Added package_service_name');
  } catch (e) {
    console.error(e.message);
  }

  process.exit(0);
}

main();
