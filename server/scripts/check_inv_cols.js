const pool = require('../src/config/db');
(async () => {
  const [cols] = await pool.query('DESCRIBE inventory');
  console.log('inventory columns:', cols.map(c => c.Field));
  process.exit(0);
})();
