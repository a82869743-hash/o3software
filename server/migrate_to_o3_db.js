const pool = require('./src/config/db');
const fs = require('fs');
const path = require('path');

async function migrateToO3() {
  const conn = await pool.getConnection();
  try {
    console.log('--- 1. Creating o3_car_spa database if not exists ---');
    await conn.query('CREATE DATABASE IF NOT EXISTS o3_car_spa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
    
    console.log('--- 2. Fetching all tables from o3_car_spa ---');
    const [tables] = await conn.query("SHOW TABLES FROM o3_car_spa;");
    const tableNames = tables.map(t => Object.values(t)[0]);

    console.log(`Found ${tableNames.length} tables in o3_car_spa.`);

    for (const table of tableNames) {
      console.log(`Copying table schema & data: ${table}...`);
      await conn.query(`CREATE TABLE IF NOT EXISTS o3_car_spa.\`${table}\` LIKE o3_car_spa.\`${table}\`;`);
      await conn.query(`TRUNCATE TABLE o3_car_spa.\`${table}\`;`);
      await conn.query(`INSERT INTO o3_car_spa.\`${table}\` SELECT * FROM o3_car_spa.\`${table}\`;`);
    }

    console.log('✓ All tables and data copied to o3_car_spa successfully!');

    // Update .env files
    const rootEnvPath = path.join(__dirname, '..', '.env');
    const serverEnvPath = path.join(__dirname, '.env');

    function updateEnvDbName(filePath) {
      if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        content = content.replace(/DB_NAME=o3_car_spa/g, 'DB_NAME=o3_car_spa');
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✓ Updated DB_NAME=o3_car_spa in ${path.basename(filePath)}`);
      }
    }

    updateEnvDbName(rootEnvPath);
    updateEnvDbName(serverEnvPath);

    console.log('\n--- 3. Verifying connection to o3_car_spa ---');
    const [o3Tables] = await conn.query("SHOW TABLES FROM o3_car_spa;");
    console.log(`o3_car_spa database now contains ${o3Tables.length} tables.`);

    process.exit(0);
  } catch (err) {
    console.error('Migration to o3_car_spa failed:', err);
    process.exit(1);
  } finally {
    conn.release();
  }
}

migrateToO3();
