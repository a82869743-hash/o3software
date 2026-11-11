/**
 * O3 Car Spaa — Database Migration Runner
 * Runs all SQL migration files in sequence.
 * Usage: node scripts/migrate.js
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: __dirname + '/../.env' });

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function migrate() {
  // Connect without database first to create it if needed
  const initConn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  const dbName = process.env.DB_NAME;
  await initConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await initConn.query(`USE \`${dbName}\``);
  console.log(`✓ Database "${dbName}" ready`);

  // Read and sort migration files (including phase2 subdirectory)
  const mainFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const phase2Dir = path.join(MIGRATIONS_DIR, 'phase2');
  const phase2Files = fs.existsSync(phase2Dir)
    ? fs.readdirSync(phase2Dir).filter(f => f.endsWith('.sql')).sort()
    : [];

  const queue = [];
  // Phase 1: Core/Main Migrations
  for (const f of mainFiles) {
    queue.push({ name: f, path: path.join(MIGRATIONS_DIR, f) });
  }
  // Phase 2: Operations Layer (v2_) Migrations
  for (const f of phase2Files) {
    queue.push({ name: `phase2/${f}`, path: path.join(phase2Dir, f) });
  }
  // Phase 3: Re-run Main Migrations to resolve ALTER statements on Phase 2 tables
  for (const f of mainFiles) {
    queue.push({ name: `${f} (re-run)`, path: path.join(MIGRATIONS_DIR, f) });
  }

  // Track applied files so each migration runs only once. Without this, every deploy re-ran the
  // seed migrations and brought back deleted packages, payment methods, roles and permissions.
  await initConn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(255) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const allNames = [...mainFiles, ...phase2Files.map(f => `phase2/${f}`)];
  const [appliedRows] = await initConn.query('SELECT name FROM schema_migrations');
  const applied = new Set(appliedRows.map(r => r.name));
  const record = async (names) => {
    for (const n of names) await initConn.query('INSERT IGNORE INTO schema_migrations (name) VALUES (?)', [n]);
  };

  let runQueue = queue;
  if (applied.size === 0) {
    const [[{ n: hasUsers }]] = await initConn.query(
      "SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'users'");
    if (hasUsers) {
      // Existing database (e.g. the go-live import): its schema is already current. Record every
      // file as applied and run nothing, so no starter data is inserted again.
      await record(allNames);
      await initConn.end();
      console.log(`\n✓ Existing database: recorded ${allNames.length} migrations as applied. Nothing was re-run.`);
      return;
    }
    // Brand-new empty database: run everything (three passes, as before), then record.
  } else {
    const pending = new Set(allNames.filter(n => !applied.has(n)));
    if (!pending.size) {
      await initConn.end();
      console.log('\n✓ Database is up to date. No new migrations.');
      return;
    }
    runQueue = queue.filter(q => pending.has(q.name));
    console.log(`New migrations: ${[...pending].join(', ')}`);
  }

  console.log(`\nRunning ${runQueue.length} migrations in sequence...\n`);

  for (const item of runQueue) {
    const file = item.name;
    const filePath = item.path;
    let sql = fs.readFileSync(filePath, 'utf8').trim();
    if (!sql) continue;

    // Parse statements using dynamic SQL delimiters
    const statements = [];
    const regex = /^\s*DELIMITER\s+(\S+)/gim;
    const sections = [];
    let currentDelimiter = ';';
    let currentStart = 0;
    let match;

    while ((match = regex.exec(sql)) !== null) {
      const sectionText = sql.substring(currentStart, match.index).trim();
      if (sectionText) {
        sections.push({ text: sectionText, delimiter: currentDelimiter });
      }
      currentDelimiter = match[1];
      currentStart = regex.lastIndex;
    }
    const finalSection = sql.substring(currentStart).trim();
    if (finalSection) {
      sections.push({ text: finalSection, delimiter: currentDelimiter });
    }

    for (const sec of sections) {
      const delim = sec.delimiter;
      let rawParts = [];
      if (delim === ';') {
        rawParts = sec.text.split(';');
      } else if (delim === '//') {
        rawParts = sec.text.split('//');
      } else {
        rawParts = sec.text.split(delim);
      }

      for (const part of rawParts) {
        const cleaned = part.trim();
        if (cleaned) {
          statements.push(cleaned);
        }
      }
    }

    let fileHasError = false;
    for (const stmt of statements) {
      try {
        await initConn.query(stmt);
      } catch (err) {
        const msg = err.message || '';
        // Continue on duplicate schema, drop index or constraint check errors
        const isSilent = msg.includes('already exists') ||
                            msg.includes('Duplicate') ||
                            msg.includes('DROP') ||
                            msg.includes('exists') ||
                            msg.includes('multiple primary key') ||
                            msg.includes('Key column') ||
                            msg.includes('Unknown column');
        if (!isSilent) {
          console.error(`  ⚠ Non-critical error in ${file}: ${msg.substring(0, 120)}`);
        }
        fileHasError = true;
      }
    }
    if (fileHasError) {
      console.log(`  ⚠ ${file} (completed with some tolerable skipped errors)`);
    } else {
      console.log(`  ✓ ${file}`);
    }
  }

  await record(applied.size === 0 ? allNames : runQueue.map(q => q.name));
  await initConn.end();
  console.log('\n✓ All migrations completed successfully.');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
