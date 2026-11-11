const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function updateAdminCredentials() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'o3_car_spa';

  console.log(`Connecting to MySQL database '${database}' at ${host}:${port}...`);

  try {
    const conn = await mysql.createConnection({ host, port, user, password, database });
    const adminHash = await bcrypt.hash('12345', 10);

    // Update existing admin or insert O3 Car Spaa solo admin
    const [result] = await conn.query(`
      INSERT INTO users (name, mobile, email, password_hash, role, is_active)
      VALUES ('Sharanpalsingh Sodhi', '7225030303', 'o3carspavvn@gmail.com', ?, 'admin', 1)
      ON DUPLICATE KEY UPDATE
        name = 'Sharanpalsingh Sodhi',
        mobile = '7225030303',
        email = 'o3carspavvn@gmail.com',
        password_hash = VALUES(password_hash),
        role = 'admin'
    `, [adminHash]);

    // Ensure all admin records match the solo admin
    await conn.query(`UPDATE users SET name = 'Sharanpalsingh Sodhi', mobile = '7225030303', email = 'o3carspavvn@gmail.com', password_hash = ? WHERE role = 'admin'`, [adminHash]);

    console.log('\n SUCCESS: O3 Car Spaa Admin Credentials Updated!');
    console.log(' - Name:     Sharanpalsingh Sodhi');
    console.log(' - Mobile:   7225030303');
    console.log(' - Email:    o3carspavvn@gmail.com');
    console.log(' - Password: 12345');
    console.log(' - Role:     admin\n');

    await conn.end();
  } catch (err) {
    console.error('Error updating admin credentials:', err.message);
  }
}

updateAdminCredentials();
