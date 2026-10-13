/**
 * scripts/backup.js — Cross-Platform MySQL Backup & Table Snapshot Engine
 * Works across Windows and Linux VPS without needing external mysqldump binary.
 */

const fs = require('fs');
const path = require('path');
const mysql = require('../server/node_modules/mysql2/promise');
require('../server/node_modules/dotenv').config({ path: path.join(__dirname, '..', '.env') });
if (!process.env.DB_NAME) {
  require('../server/node_modules/dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });
}

async function runBackup() {
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = parseInt(process.env.DB_PORT || '3306', 10);
  const dbUser = process.env.DB_USER || 'root';
  const dbPass = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME || 'o3_car_spa';

  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').split('.')[0];
  const backupFile = path.join(backupDir, `o3_car_spaa_${timestamp}.sql`);

  console.log(`[backup] 📦 Connecting to ${dbUser}@${dbHost}:${dbPort}/${dbName}...`);
  const conn = await mysql.createConnection({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPass,
    database: dbName,
    multipleStatements: true
  });

  const [tables] = await conn.query('SHOW TABLES');
  const tableNames = tables.map(r => Object.values(r)[0]);
  console.log(`[backup] Found ${tableNames.length} tables to snapshot.`);

  let dump = `-- O3 Car Spaa Automated Database Backup\n-- Database: ${dbName}\n-- Created: ${new Date().toISOString()}\n\nSET FOREIGN_KEY_CHECKS=0;\n\n`;

  for (const table of tableNames) {
    const [[createRes]] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
    dump += `DROP TABLE IF EXISTS \`${table}\`;\n`;
    dump += `${createRes['Create Table']};\n\n`;

    const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
    if (rows.length > 0) {
      dump += `INSERT INTO \`${table}\` VALUES\n`;
      const rowInserts = rows.map(row => {
        const vals = Object.values(row).map(v => {
          if (v === null) return 'NULL';
          if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
          if (typeof v === 'object') return mysql.escape(JSON.stringify(v));
          return mysql.escape(v);
        });
        return `(${vals.join(', ')})`;
      });
      dump += `${rowInserts.join(',\n')};\n\n`;
    }
  }

  dump += 'SET FOREIGN_KEY_CHECKS=1;\n';
  fs.writeFileSync(backupFile, dump, 'utf8');
  await conn.end();

  const stats = fs.statSync(backupFile);
  console.log(`[backup] ✅ Backup created: ${backupFile} (${(stats.size / 1024).toFixed(1)} KB)`);

  // Retention: prune files older than 7 days
  const now = Date.now();
  const files = fs.readdirSync(backupDir);
  for (const f of files) {
    if (f.startsWith('o3_car_spaa_') && f.endsWith('.sql')) {
      const filePath = path.join(backupDir, f);
      const fStat = fs.statSync(filePath);
      if (now - fStat.mtimeMs > 7 * 24 * 60 * 60 * 1000) {
        fs.unlinkSync(filePath);
        console.log(`[backup] 🗑️ Pruned old backup: ${f}`);
      }
    }
  }
}

runBackup().catch(err => {
  console.error('[backup] ❌ Fatal error:', err);
  process.exit(1);
});
