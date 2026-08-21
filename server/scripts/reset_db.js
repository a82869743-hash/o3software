// WARNING: Development only. Do NOT run in production.
/**
 * O3 Car Spa — Full Database Reset & Rebuild
 * Drops the database completely and re-runs all 21 migrations from scratch.
 * Usage: node scripts/reset_db.js
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function resetAndRebuild() {
  const dbName = process.env.DB_NAME || 'o3_car_spa';

  console.log('========================================');
  console.log('  O3 Car Spa — Database Reset');
  console.log('========================================\n');

  // 1. Connect without database
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  // 2. Drop existing database
  console.log(`[1/3] Dropping database "${dbName}"...`);
  await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  console.log('  ✓ Database dropped\n');

  // 3. Create fresh database
  console.log(`[2/3] Creating fresh database "${dbName}"...`);
  await conn.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${dbName}\``);
  console.log('  ✓ Database created\n');

  // 4. Run all migrations in order
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`[3/3] Running ${files.length} migrations...\n`);

  let success = 0;
  let failed = 0;

  for (const file of files) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf8').trim();
    if (!sql) continue;

    try {
      await conn.query(sql);
      console.log(`  ✓ ${file}`);
      success++;
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message}`);
      failed++;
    }
  }

  // 5. Verify table count
  const [tables] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
    [dbName]
  );

  console.log(`\n========================================`);
  console.log(`  Results`);
  console.log(`========================================`);
  console.log(`  Migrations run: ${success} succeeded, ${failed} failed`);
  console.log(`  Tables created: ${tables.length}`);
  console.log(`\n  Tables:`);
  tables.forEach(t => console.log(`    • ${t.TABLE_NAME}`));

  await conn.end();
  console.log(`\n✓ Database "${dbName}" is clean and ready!`);
}

resetAndRebuild().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
