const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function importVehicles() {
  const filePath = path.join(__dirname, '..', '..', 'car model dataset.csv');
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const lines = fileContent.split(/\r?\n/);

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'o3_car_spa',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  try {
    console.log('Connecting to DB and running migration...');
    const migrationPath = path.join(__dirname, '..', 'migrations', '023_vehicle_master.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    await pool.query(migrationSql);

    console.log('Clearing existing data (optional)...');
    await pool.query('TRUNCATE TABLE vehicle_master');

    const vehicles = [];
    // skip header row
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if(!line) continue;
        const columns = line.split(',');
        // columns: index, Make, Model, Variant
        const make = columns[1]?.trim();
        const model = columns[2]?.trim();
        const variant = columns[3]?.trim() || '';

        if(make && model) {
            vehicles.push([make, model, variant]);
        }
    }

    console.log(`Parsed ${vehicles.length} vehicles. Inserting...`);
    
    // Batch insert
    if (vehicles.length > 0) {
        const query = 'INSERT INTO vehicle_master (make, model, variant) VALUES ?';
        await pool.query(query, [vehicles]);
    }

    console.log('Successfully imported vehicle data.');
  } catch (err) {
    console.error('Error during import:', err);
  } finally {
    await pool.end();
  }
}

importVehicles();
