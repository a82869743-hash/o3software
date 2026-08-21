const pool = require('./src/config/db');

async function checkDB() {
  try {
    const [tables] = await pool.query('SHOW TABLES');
    console.log('Tables in database:', tables.map(t => Object.values(t)[0]));
    
    const [bookingsDesc] = await pool.query('DESCRIBE bookings');
    console.log('Bookings table structure:', bookingsDesc);

    const [deliveriesDesc] = await pool.query('DESCRIBE deliveries');
    console.log('Deliveries table structure:', deliveriesDesc);

    process.exit(0);
  } catch (err) {
    console.error('DB Check failed:', err);
    process.exit(1);
  }
}

checkDB();
