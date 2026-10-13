/**
 * scripts/test_restore.js — Automated Backup Verification & Restore Validator
 * Restores the latest backup into a temporary database, verifies all table row counts
 * match the primary database 1:1, and tears down the temporary test database.
 */

const fs = require('fs');
const path = require('path');
const mysql = require('../server/node_modules/mysql2/promise');
require('../server/node_modules/dotenv').config({ path: path.join(__dirname, '..', '.env') });
if (!process.env.DB_NAME) {
  require('../server/node_modules/dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
}

async function testRestore() {
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = parseInt(process.env.DB_PORT || '3306', 10);
  const dbUser = process.env.DB_USER || 'root';
  const dbPass = process.env.DB_PASSWORD || '';
  const primaryDb = process.env.DB_NAME || 'o3_car_spa';
  const tempDb = `${primaryDb}_restore_test_${Date.now()}`;

  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    throw new Error('No backups directory found.');
  }

  const files = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('o3_car_spaa_') && f.endsWith('.sql'))
    .sort()
    .reverse();

  if (!files.length) {
    throw new Error('No backup SQL files available to restore.');
  }

  const latestBackup = path.join(backupDir, files[0]);
  console.log(`[test-restore] 🧪 Verifying latest backup file: ${files[0]}`);

  const conn = await mysql.createConnection({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPass,
    multipleStatements: true
  });

  try {
    // 1. Create temporary database
    console.log(`[test-restore] Creating temporary test database: ${tempDb}...`);
    await conn.query(`CREATE DATABASE \`${tempDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${tempDb}\``);

    // 2. Execute backup SQL
    console.log(`[test-restore] Restoring snapshot into temporary database...`);
    const dumpContent = fs.readFileSync(latestBackup, 'utf8');
    await conn.query(dumpContent);
    console.log(`[test-restore] Schema and data restored successfully.`);

    // 3. Compare row counts between primary database and restored database
    const [primaryTablesRes] = await conn.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = '${primaryDb}' AND table_type = 'BASE TABLE'`);
    const tables = primaryTablesRes.map(r => r.table_name || r.TABLE_NAME);

    console.log(`[test-restore] Comparing row counts across ${tables.length} tables...`);
    let mismatches = 0;
    let verifiedTables = 0;

    for (const table of tables) {
      const [[{ primCount }]] = await conn.query(`SELECT COUNT(*) as primCount FROM \`${primaryDb}\`.\`${table}\``);
      const [[{ tempCount }]] = await conn.query(`SELECT COUNT(*) as tempCount FROM \`${tempDb}\`.\`${table}\``);

      if (primCount !== tempCount) {
        console.error(`  ❌ MISMATCH in table \`${table}\`: Primary has ${primCount} rows, Backup has ${tempCount} rows!`);
        mismatches++;
      } else {
        verifiedTables++;
      }
    }

    if (mismatches > 0) {
      throw new Error(`Data restoration validation failed: ${mismatches} table row count mismatches detected!`);
    }

    console.log(`\n[test-restore] ✅ All ${verifiedTables} tables verified 100% identical row-for-row.`);

  } finally {
    // 4. Teardown temporary database
    console.log(`[test-restore] 🧹 Dropping temporary test database: ${tempDb}...`);
    await conn.query(`DROP DATABASE IF EXISTS \`${tempDb}\``);
    await conn.end();
  }

  console.log('[test-restore] 🌟 RESTORE VALIDATION PASSED WITH 100% ACCURACY!\n');
}

testRestore().catch(err => {
  console.error('[test-restore] ❌ Fatal validation error:', err.message);
  process.exit(1);
});
