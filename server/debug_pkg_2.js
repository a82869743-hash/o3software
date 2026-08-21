const pool = require('./src/config/db');

async function debug() {
  const conn = await pool.getConnection();
  try {
    const [pkgs] = await conn.query("SELECT * FROM packages");
    console.log("Packages:", pkgs);
    const [ps] = await conn.query("SELECT * FROM package_services");
    console.log("Package Services:", ps);
    const [svcs] = await conn.query("SELECT * FROM services");
    console.log("Services:", svcs);
  } catch (err) {
    console.error(err);
  } finally {
    conn.release();
    process.exit(0);
  }
}
debug();
