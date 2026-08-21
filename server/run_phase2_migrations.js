const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  // Disable FK checks during migration
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');

  const migrationsDir = path.join(__dirname, 'migrations', 'phase2');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`Running ${files.length} Phase 2 v2 migrations...\n`);

  for (const file of files) {
    console.log(`Running ${file}...`);
    try {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await conn.query(sql);
      console.log(`✓ ${file} applied successfully.`);
    } catch (err) {
      if (err.errno === 1050 || err.errno === 1060 || err.errno === 1061) {
        console.log(`⚠ ${file} — table/column already exists, skipping.`);
      } else {
        console.error(`✗ Error applying ${file}:`, err.message);
      }
    }
  }

  // Re-enable FK checks
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  await conn.end();
  console.log('\n✓ All Phase 2 v2 migrations completed.');
}

run();
