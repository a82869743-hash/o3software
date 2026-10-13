const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');

async function runMigration() {
  console.log('Running Migration 104: Leads Agent, Unified WhatsApp Inbox, Knowledge Base & AI CRM...');
  const sqlPath = path.join(__dirname, '..', 'migrations', '104_leads_and_ai_crm.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Split statements by semicolon
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const statement of statements) {
    if (!statement.trim()) continue;
    try {
      await pool.query(statement);
      console.log('Executed statement:', statement.slice(0, 40).replace(/\n/g, ' '));
    } catch (err) {
      console.error(`Statement error: ${err.message}\nSQL: ${statement.slice(0, 60)}`);
      throw err;
    }
  }

  console.log('✅ Migration 104 executed successfully!');
  process.exit(0);
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
