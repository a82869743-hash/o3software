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
  multipleStatements: true,
  // Resilience: auto-reconnect on idle disconnect
  enableKeepAlive: true,
  keepAliveInitialDelay: 30000,
});



// Test connection on startup
(async () => {
  try {
    const conn = await pool.getConnection();
    await conn.query("SET time_zone = '+05:30'");
    console.log(`✓ MySQL connected: ${process.env.DB_NAME}@${process.env.DB_HOST} (Timezone set to IST +05:30)`);
    conn.release();
  } catch (err) {
    console.error('✗ MySQL connection failed:', err.message);
    console.error('  Check your DB_HOST, DB_USER, DB_PASSWORD, DB_NAME environment variables');
  }
})();

module.exports = pool;
