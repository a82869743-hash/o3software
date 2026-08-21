const mysql = require('mysql2/promise');

async function main() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'o3_car_spa',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  try {
    const [users] = await pool.query("SELECT id, name, email, role, mobile FROM users WHERE role = 'staff' LIMIT 5");
    console.log('Available test users:');
    console.log(users);
  } catch (err) {
    console.error('Error fetching users:', err);
  } finally {
    await pool.end();
  }
}

main();
