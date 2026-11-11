const pool = require('../src/config/db');

async function setup() {
  const customerId = 107;
  const mobile = '8238538098';

  // 1. Vehicle
  let [vehicles] = await pool.query('SELECT id FROM vehicles WHERE customer_id = ?', [customerId]);
  let vehicleId = vehicles[0].id;

  // 2. Job Card
  let [jobs] = await pool.query('SELECT id FROM job_carts WHERE vehicle_id = ?', [vehicleId]);
  let jobCardId;
  if (!jobs.length) {
    const [jRes] = await pool.query(
      `INSERT INTO job_carts (vehicle_id, franchise_id, visit_date, created_by, status, total_amount, balance_due, payment_status, created_at, updated_at)
       VALUES (?, 1, CURDATE(), 1, 'open', 45000, 15000, 'pending', NOW(), NOW())`,
      [vehicleId]
    );
    jobCardId = jRes.insertId;
    console.log('Created Job Card ID:', jobCardId);

    // Add PPF Service to job card
    await pool.query(
      `INSERT INTO job_services (job_cart_id, service_name, service_price) VALUES (?, 'Stek Dynoshield TPU Full PPF', 45000)`,
      [jobCardId]
    );
  } else {
    jobCardId = jobs[0].id;
  }

  // 3. User Package expiring in 3 days
  const [pkgs] = await pool.query('SELECT id FROM packages LIMIT 1');
  const pkgId = pkgs.length ? pkgs[0].id : 1;
  const [upkgs] = await pool.query('SELECT id FROM user_packages WHERE user_id = ?', [customerId]);
  if (!upkgs.length) {
    const expDate = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    await pool.query(
      `INSERT INTO user_packages (user_id, package_id, vehicle_id, start_date, end_date, price_paid, package_status, payment_status, franchise_id)
       VALUES (?, ?, ?, NOW(), ?, 25000, 'active', 'paid', 1)`,
      [customerId, pkgId, vehicleId, expDate]
    );
    console.log('Created User Package expiring in 3 days');
  }

  // 4. Inquiry / Lead
  const [inqs] = await pool.query('SELECT id FROM inquiries WHERE mobile = ?', [mobile]);
  if (!inqs.length) {
    await pool.query(
      `INSERT INTO inquiries (name, mobile, email, vehicle_brand, vehicle_model, services_interested, status, source)
       VALUES ('Demo Customer', ?, 'customer.demo@o3carspaa.com', 'BMW', 'M340i', 'Ceramic Coating & PPF Detailing', 'new', 'website')`,
      [mobile]
    );
    console.log('Created Inquiry for mobile:', mobile);
  }

  console.log('✅ Demo test setup completed successfully.');
  process.exit(0);
}

setup().catch(err => {
  console.error(err);
  process.exit(1);
});
