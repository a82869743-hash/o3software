const mysql = require('mysql2/promise');

async function main() {
  const db = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'o3_car_spa'
  });

  try {
    const [rows] = await db.query('DESCRIBE job_carts');
    console.log('job_carts columns:');
    rows.forEach(r => {
      console.log(`  - ${r.Field}: ${r.Type}`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    await db.end();
  }
}

main();
