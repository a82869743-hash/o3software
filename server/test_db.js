const pool = require('./src/config/db');

async function test() {
  const [services] = await pool.query('SELECT * FROM services');
  console.log('Services:', services);
  
  const [packages] = await pool.query('SELECT * FROM packages');
  console.log('Packages:', packages);

  const [packageServices] = await pool.query('SELECT * FROM package_services');
  console.log('Package Services:', packageServices);

  process.exit(0);
}

test();
