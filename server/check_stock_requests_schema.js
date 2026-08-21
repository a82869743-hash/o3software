const pool = require('./src/config/db');

async function checkSchema() {
  const conn = await pool.getConnection();
  try {
    const [cols] = await conn.query('DESCRIBE franchise_stock_requests');
    console.log('Columns in franchise_stock_requests:', cols);
  } catch (err) {
    console.error('Error describing franchise_stock_requests:', err);
  } finally {
    conn.release();
    process.exit(0);
  }
}

checkSchema();
