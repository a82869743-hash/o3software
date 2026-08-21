const pool = require('./src/config/db');

async function check() {
  const conn = await pool.getConnection();
  try {
    const tables = ['job_carts', 'quotations', 'manual_bills', 'quick_wash_bookings', 'user_package_requests'];
    for (const t of tables) {
      try {
        const [cols] = await conn.query(`DESCRIBE ${t}`);
        console.log(`\n=== Table: ${t} ===`);
        console.log(cols.map(c => `${c.Field} (${c.Type})`).join(', '));
      } catch (e) {
        console.log(`Table ${t} does not exist or error:`, e.message);
      }
    }
  } finally {
    conn.release();
    process.exit(0);
  }
}

check();
