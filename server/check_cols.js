const pool = require('./src/config/db');
pool.query('SHOW COLUMNS FROM package_requests').then(res => {
  console.log(res[0]);
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
