const pool = require('./src/config/db');

async function checkSchema() {
  try {
    const [bookings] = await pool.query('DESCRIBE bookings;');
    console.log('--- BOOKINGS ---');
    console.table(bookings);

    const [services] = await pool.query('DESCRIBE services;');
    console.log('--- SERVICES ---');
    console.table(services);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
checkSchema();
