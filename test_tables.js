const pool = require('./server/src/config/db');
async function run() {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SHOW TABLES');
    console.log(rows);
    const [qRows] = await conn.query('DESCRIBE quick_washes').catch(() => [null]);
    if (qRows) console.log(qRows);
  } finally {
    conn.release();
    process.exit(0);
  }
}
run();
