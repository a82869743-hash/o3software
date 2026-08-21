const pool = require('./server/src/config/db');
async function run() {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SHOW TABLES');
    console.log('Tables in database:', rows.map(r => Object.values(r)[0]));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    conn.release();
    process.exit(0);
  }
}
run();
