const pool = require('./src/config/db');
(async () => {
  const [rows] = await pool.query('SELECT id, name FROM services WHERE is_active = 1 ORDER BY id');
  rows.forEach(s => console.log(s.id, '|', s.name));
  process.exit(0);
})();
