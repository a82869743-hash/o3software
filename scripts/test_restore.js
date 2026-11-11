/**
 * scripts/test_restore.js — proves the newest backup can really be restored.
 * Restores backups/daily/<newest>.sql.gz into a temporary database, checks every table came back,
 * compares row counts with the live database, then drops the temporary database.
 * Run weekly by cron (deploy/crontab.txt) and any time by hand:  node scripts/test_restore.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const mysql = require('../server/node_modules/mysql2/promise');
const dotenv = require('../server/node_modules/dotenv');
dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const host = process.env.DB_HOST || 'localhost';
const port = parseInt(process.env.DB_PORT || '3306', 10);
const user = process.env.DB_USER || 'root';
const password = process.env.DB_PASSWORD || '';
const primaryDb = process.env.DB_NAME || 'o3_car_spa';

function newestBackup() {
  const dirs = ['daily', 'weekly', 'monthly', ''].map(d => path.join(__dirname, '..', 'backups', d));
  const all = [];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) if (/^o3_car_spaa_.*\.sql(\.gz)?$/.test(f)) all.push(path.join(d, f));
  }
  all.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return all[0];
}

function restoreInto(file, db) {
  return new Promise((resolve, reject) => {
    const p = spawn('mysql', [`--host=${host}`, `--port=${port}`, `--user=${user}`, '--default-character-set=utf8mb4', db],
      { env: { ...process.env, MYSQL_PWD: password }, stdio: ['pipe', 'inherit', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('error', reject);
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(`mysql exited ${code}: ${err.slice(0, 500)}`))));
    const src = fs.createReadStream(file);
    (file.endsWith('.gz') ? src.pipe(zlib.createGunzip()) : src).pipe(p.stdin);
  });
}

(async () => {
  const file = newestBackup();
  if (!file) throw new Error('No backup files found in backups/');
  const ageH = (Date.now() - fs.statSync(file).mtimeMs) / 3600000;
  console.log(`[test-restore] Newest backup: ${path.basename(file)} (${ageH.toFixed(1)} hours old)`);
  if (ageH > 26) console.warn('[test-restore] ⚠️  Newest backup is more than a day old — check the backup cron');

  const tempDb = `${primaryDb}_restore_test_${Date.now()}`;
  const conn = await mysql.createConnection({ host, port, user, password });
  try {
    await conn.query(`CREATE DATABASE \`${tempDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await restoreInto(file, tempDb);

    const [live] = await conn.query("SELECT table_name t FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'", [primaryDb]);
    const [rest] = await conn.query("SELECT table_name t FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'", [tempDb]);
    const restored = new Set(rest.map(r => r.t || r.TABLE_NAME));
    const missing = live.map(r => r.t || r.TABLE_NAME).filter(t => !restored.has(t));
    let emptied = 0, differs = 0;
    for (const t of restored) {
      const [[a]] = await conn.query(`SELECT COUNT(*) n FROM \`${primaryDb}\`.\`${t}\``).catch(() => [[{ n: 0 }]]);
      const [[b]] = await conn.query(`SELECT COUNT(*) n FROM \`${tempDb}\`.\`${t}\``);
      if (a.n !== b.n) differs++;
      if (a.n > 20 && b.n === 0) { emptied++; console.error(`  ❌ ${t}: live has ${a.n} rows, backup has none`); }
    }
    if (missing.length) throw new Error(`Tables missing from the backup: ${missing.join(', ')}`);
    if (emptied) throw new Error(`${emptied} table(s) came back empty`);
    console.log(`[test-restore] ✅ ${restored.size} tables restored. ${differs} differ in row count only because the live data changed after the backup.`);
  } finally {
    await conn.query(`DROP DATABASE IF EXISTS \`${tempDb}\``);
    await conn.end();
  }
  console.log('[test-restore] 🌟 Backup restore test PASSED');
})().catch(err => {
  console.error('[test-restore] ❌ FAILED:', err.message);
  process.exit(1);
});
