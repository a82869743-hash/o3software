const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

async function cleanData() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'o3_car_spa',
  });

  console.log('Connected. Cleaning fake/wrong data...\n');

  // 1. Delete all packages (user will re-add only O3 official ones)
  await conn.query('DELETE FROM package_services');
  const [pkgDel] = await conn.query('DELETE FROM packages');
  console.log(`Deleted ${pkgDel.affectedRows} packages and all package_services`);

  // 2. Delete all wrong services (keep only O3 official ones)
  // First check what's there
  const [svcs] = await conn.query('SELECT id, name FROM services');
  console.log('Current services:', svcs.map(s => `${s.id}: ${s.name}`).join(', '));

  // Delete ALL services - we'll seed correctly once pricing image is provided
  const [svcDel] = await conn.query('DELETE FROM services');
  console.log(`Deleted ${svcDel.affectedRows} wrong/old services`);

  await conn.end();
  console.log('\nDone. Database cleaned of wrong packages and services.');
}

cleanData().catch(e => { console.error(e); process.exit(1); });
