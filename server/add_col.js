const pool = require('./src/config/db');
pool.query('ALTER TABLE package_requests ADD COLUMN rejection_reason TEXT NULL').then(res => {
  console.log('Added rejection_reason successfully');
  process.exit(0);
}).catch(err => {
  if(err.code === 'ER_DUP_FIELDNAME') {
    console.log('rejection_reason already exists');
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});
