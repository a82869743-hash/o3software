const pool = require('../src/config/db');

async function inspectData() {
  console.log('=== CHECKING ALL TABLES FOR TEST DATA ===\n');
  const [tables] = await pool.query("SHOW TABLES");
  const tableNames = tables.map(t => Object.values(t)[0]);

  for (const table of tableNames) {
    const [rows] = await pool.query(`SELECT COUNT(*) as cnt FROM \`${table}\``);
    if (rows[0].cnt > 0) {
      console.log(`Table '${table}': ${rows[0].cnt} rows`);
      if (['inventory', 'products', 'stock_requests', 'vendors', 'users'].includes(table)) {
        const [samples] = await pool.query(`SELECT * FROM \`${table}\` LIMIT 5`);
        console.log(`  Sample names in '${table}':`, samples.map(s => s.name || s.product_name || s.title || s.id));
      }
    }
  }

  process.exit(0);
}

inspectData();
