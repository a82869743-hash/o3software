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
    console.log('=== FOREIGN KEY CONSTRAINTS AUDIT ===\n');
    
    const query = `
      SELECT 
        TABLE_NAME, 
        COLUMN_NAME, 
        CONSTRAINT_NAME, 
        REFERENCED_TABLE_NAME, 
        REFERENCED_COLUMN_NAME
      FROM 
        INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE 
        TABLE_SCHEMA = 'o3_car_spa' 
        AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY 
        TABLE_NAME, COLUMN_NAME;
    `;

    const [rows] = await pool.query(query);
    console.log(`Found ${rows.length} active foreign key constraints in database:\n`);
    
    rows.forEach(r => {
      console.log(`  - \`${r.TABLE_NAME}.${r.COLUMN_NAME}\` -> \`${r.REFERENCED_TABLE_NAME}.${r.REFERENCED_COLUMN_NAME}\` (${r.CONSTRAINT_NAME})`);
    });

  } catch (err) {
    console.error('Error fetching foreign keys:', err);
  } finally {
    await pool.end();
  }
}

main();
