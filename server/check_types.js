const pool = require('./src/config/db');

async function check() {
  const [rows] = await pool.query(
    `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE 
     FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = 'o3_car_spa' 
       AND COLUMN_NAME = 'id' 
       AND TABLE_NAME IN ('users','bookings','job_carts','staff')`
  );
  console.log(JSON.stringify(rows, null, 2));
  process.exit();
}

check();
