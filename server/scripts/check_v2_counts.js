const mysql = require('mysql2/promise');

async function main() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'o3_car_spa',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  try {
    console.log('=== V2 TABLES ROW COUNT SANITY CHECK ===\n');
    
    const v2Tables = [
      'v2_wallets', 
      'v2_payments', 
      'v2_referrals', 
      'v2_roles', 
      'v2_permissions', 
      'v2_role_permissions', 
      'v2_tracking_history', 
      'v2_blocked_slots'
    ];

    for (const table of v2Tables) {
      const [rows] = await pool.query(`SELECT COUNT(*) as count FROM \`${table}\``);
      console.log(`  Table \`${table}\`: ${rows[0].count} rows`);
    }

    console.log('\n=== ENUM DEFINITIONS IN SCHEMA ===\n');

    const enumQuery = `
      SELECT 
        TABLE_NAME, 
        COLUMN_NAME, 
        COLUMN_TYPE 
      FROM 
        INFORMATION_SCHEMA.COLUMNS 
      WHERE 
        TABLE_SCHEMA = 'o3_car_spa' 
        AND COLUMN_TYPE LIKE 'enum%'
        AND TABLE_NAME IN ('bookings', 'job_carts', 'users');
    `;

    const [enumRows] = await pool.query(enumQuery);
    enumRows.forEach(r => {
      console.log(`  - \`${r.TABLE_NAME}.${r.COLUMN_NAME}\`: ${r.COLUMN_TYPE}`);
    });

  } catch (err) {
    console.error('Error executing query:', err);
  } finally {
    await pool.end();
  }
}

main();
