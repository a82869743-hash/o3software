const pool = require('../src/config/db');

async function check() {
  const [rows] = await pool.query('SHOW TABLES');
  const allTables = rows.map(r => Object.values(r)[0]);
  console.log('Total tables:', allTables.length);
  console.log('CRM / Lead / Chat tables:', allTables.filter(t => t.includes('lead') || t.includes('crm') || t.includes('inbox') || t.includes('chat') || t.includes('conversation')));
  process.exit(0);
}

check().catch(console.error);
