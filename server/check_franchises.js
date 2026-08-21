const pool = require('./src/config/db');
async function check() {
  try {
    const [rows] = await pool.query('DESCRIBE franchises');
    console.log('FRANCHISES TABLE:', rows);
    const [invRows] = await pool.query('DESCRIBE inventory');
    console.log('INVENTORY TABLE:', invRows.filter(r => r.Field === 'id'));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
check();
