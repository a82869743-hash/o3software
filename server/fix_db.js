const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
  });
  
  try {
    console.log('Adding expires_at...');
    await connection.query("ALTER TABLE bookings ADD COLUMN expires_at TIMESTAMP NULL AFTER booking_notes");
    console.log('expires_at added');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('Column already exists:', e.message);
    } else {
      console.error(e);
    }
  }

  try {
    await connection.query("ALTER TABLE bookings ADD COLUMN approved_by INT UNSIGNED NULL AFTER expires_at");
    console.log('approved_by added');
  } catch(e) {}
  
  try {
    await connection.query("ALTER TABLE bookings ADD COLUMN approved_at TIMESTAMP NULL AFTER approved_by");
    console.log('approved_at added');
  } catch(e) {}

  await connection.end();
}
run();
