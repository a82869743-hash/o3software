const pool = require('./server/src/config/db');
const userPkgCtrl = require('./server/src/controllers/userPackagesController');

async function test() {
  const conn = await pool.getConnection();
  try {
    const [up] = await conn.query("SELECT * FROM user_packages WHERE package_status = 'active' ORDER BY id DESC LIMIT 5");
    console.log('user_packages:', up.map(u => ({ id: u.id, user_id: u.user_id, package_id: u.package_id })));
    
    if (up.length > 0) {
      const [usage] = await conn.query('SELECT * FROM package_usage WHERE user_package_id = ?', [up[0].id]);
      console.log('package_usage:', usage);
      
      if (usage.length > 0) {
         console.log(`Testing checkServiceAvailability for user ${up[0].user_id}, service: ${usage[0].service_name}`);
         const result = await userPkgCtrl.checkServiceAvailability(conn, up[0].user_id, usage[0].service_name);
         console.log('Result:', result);
         
         // test with all usage service_names
         for (const u of usage) {
             const res = await userPkgCtrl.checkServiceAvailability(conn, up[0].user_id, u.service_name);
             console.log(`Result for ${u.service_name}:`, res);
         }
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
test();
