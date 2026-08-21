const pool = require('./server/src/config/db');
async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`ALTER TABLE bookings ADD COLUMN job_type ENUM('standard', 'quick_wash') DEFAULT 'standard'`);
    console.log("Added job_type");
  } catch(e) { console.error(e.message); }

  try {
    await conn.query(`ALTER TABLE bookings ADD COLUMN wash_status ENUM('pending', 'washing', 'completed', 'delivered') DEFAULT 'pending'`);
    console.log("Added wash_status");
  } catch(e) { console.error(e.message); }

  try {
    await conn.query(`ALTER TABLE bookings ADD COLUMN queue_position INT DEFAULT 0`);
    console.log("Added queue_position");
  } catch(e) { console.error(e.message); }

  try {
    await conn.query(`ALTER TABLE bookings ADD COLUMN vehicle_id INT UNSIGNED DEFAULT NULL`);
    console.log("Added vehicle_id");
  } catch(e) { console.error(e.message); }

  process.exit(0);
}
run();
