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

  const files = [
    '054_phase2_payment_system.sql',
    '055_phase2_feedback_referral.sql',
    '056_phase2_audit_staff_ext.sql',
    '057_phase3_gaps.sql',
    '085_franchise_tenant_isolation.sql',
    '086_package_reminders_and_schedules.sql',
    '087_inventory_franchise_pricing.sql',
    '088_franchise_stock_requests.sql',
    '089_geofenced_facial_attendance.sql',
    '090_payment_qrs.sql',
    '091_job_card_pre_inspection.sql'
  ];

  for (const file of files) {
    console.log(`Running ${file}...`);
    try {
      const sql = fs.readFileSync(path.join(__dirname, 'migrations', file), 'utf8');
      const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
      for (const stmt of statements) {
        try {
          await conn.query(stmt);
        } catch (err) {
          // Ignore ER_DUP_FIELDNAME (1060), ER_DUP_KEYNAME (1061), ER_TABLE_EXISTS_ERROR (1050)
          if ([1060, 1061, 1050].includes(err.errno)) {
            // safely ignore
          } else {
            console.error(`\nError in statement:\n${stmt}\n`);
            throw err;
          }
        }
      }
      console.log(`✓ ${file} applied successfully.`);
    } catch (err) {
      console.error(`✗ Error applying ${file}:`, err.message);
    }
  }

  await conn.end();
  console.log('Done.');
}

run();
