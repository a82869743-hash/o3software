const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');

// ─── Validate required DB env vars ──────────────────
const requiredVars = ['DB_HOST', 'DB_USER', 'DB_NAME'];
for (const v of requiredVars) {
  if (!process.env[v]) {
    console.error(`[FATAL] Missing required environment variable: ${v}`);
    process.exit(1);
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+05:30',
  // Date-only columns (slot_date, att_date, end_date …) come back as plain "2026-11-12" text.
  // As date objects they went to the app as "2026-11-11T18:30:00Z" (the day before, UTC), which screens
  // that compared dates as text read as yesterday — e.g. today's booking listed under Past.
  dateStrings: ['DATE'],
  // one statement per query (limits the damage of any SQL injection)
  multipleStatements: false,
  // Resilience: auto-reconnect on idle disconnect
  enableKeepAlive: true,
  keepAliveInitialDelay: 30000,
});

// Every connection runs in Indian time, so NOW() / CURDATE() match the studio's day even on a UTC server
pool.pool.on('connection', (c) => { c.query("SET time_zone = '+05:30'"); });

// Safety net: a connection handed back with an unfinished transaction is rolled back first,
// so an early `return` in a controller can never leave half-done work for the next request.
const rawGetConnection = pool.getConnection.bind(pool);
pool.getConnection = async () => {
  const conn = await rawGetConnection();
  if (conn.__txWrapped) return conn;
  conn.__txWrapped = true;
  const begin = conn.beginTransaction.bind(conn);
  const commit = conn.commit.bind(conn);
  const rollback = conn.rollback.bind(conn);
  const release = conn.release.bind(conn);
  conn.beginTransaction = async (...a) => { const r = await begin(...a); conn.__inTx = true; return r; };
  conn.commit = async (...a) => { const r = await commit(...a); conn.__inTx = false; return r; };
  conn.rollback = async (...a) => { conn.__inTx = false; return rollback(...a); };
  conn.release = () => {
    if (!conn.__inTx) return release();
    conn.__inTx = false;
    console.warn('[db] connection released inside an open transaction — rolled back');
    rollback().catch(() => {}).finally(() => release());
  };
  return conn;
};



// Test connection on startup
(async () => {
  try {
    const conn = await pool.getConnection();
    await conn.query("SET time_zone = '+05:30'");
    console.log(`✓ MySQL connected: ${process.env.DB_NAME}@${process.env.DB_HOST} (Timezone set to IST +05:30)`);
    conn.release();
  } catch (err) {
    console.error('\n' + '═'.repeat(60));
    console.error('⚠  MySQL Connection Notice:', err.message);
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   The MySQL user/password in .env (DB_USER / DB_PASSWORD) was rejected.');
    } else {
      console.error('   Please verify MySQL service is running on ' + (process.env.DB_HOST || 'localhost') + ':' + (process.env.DB_PORT || '3306'));
    }
    console.error('═'.repeat(60) + '\n');
  }
})();

module.exports = pool;
