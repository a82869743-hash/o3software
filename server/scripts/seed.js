// WARNING: Development only. Do NOT run in production.
/**
 * O3 Car Spa — Database Seed Script
 * Populates development data: admin, customer, staff, services, inventory, packages.
 * Usage: node scripts/seed.js
 */
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    console.error('ERROR: Cannot run seed script in production environment.');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'o3_car_spa',
    multipleStatements: true,
  });

  console.log('Seeding database...\n');

  // ─── Users ────────────────────────────────────────
  const adminHash = await bcrypt.hash('12345', 10);

  await conn.query(`
    INSERT INTO users (name, mobile, email, password_hash, role) VALUES
      ('Sharanpalsingh Sodhi', '7225030303', 'o3carspavvn@gmail.com', ?, 'admin')
    ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash)
  `, [adminHash]);
  console.log('  ✓ O3 Car Spa Solo Admin seeded (Sharanpalsingh Sodhi - 7225030303)');

  // ─── Loyalty for customer ─────────────────────────
  const [customers] = await conn.query(`SELECT id FROM users WHERE mobile = '9000000002'`);
  if (customers.length) {
    await conn.query(`
      INSERT INTO loyalty (customer_id, credits, free_washes, wax_count)
      VALUES (?, 200, 1, 0)
      ON DUPLICATE KEY UPDATE credits = 200, free_washes = 1
    `, [customers[0].id]);
    console.log('  ✓ Loyalty record created for test customer');
  }

  // ─── Staff Profile ────────────────────────────────
  const [staffUsers] = await conn.query(`SELECT id FROM users WHERE mobile = '9000000003'`);
  if (staffUsers.length) {
    await conn.query(`
      INSERT INTO staff_profiles (user_id, specialisations)
      VALUES (?, 'Car Wash, Interior Detailing')
      ON DUPLICATE KEY UPDATE user_id = user_id
    `, [staffUsers[0].id]);
    console.log('  ✓ Staff profile created');
  }

  // ─── Services ─────────────────────────────────────
  await conn.query(`
    INSERT INTO services (name, description, price_hatchback, price_sedan, price_suv, is_active) VALUES
      ('Car Wash Basic', 'Exterior wash with premium shampoo and tire dressing', 400, 500, 600, 1),
      ('PPF Coating', 'Paint Protection Film application for long-lasting paint protection', 8000, 10000, 12000, 1),
      ('Ceramic Coating', '9H Ceramic coating for ultimate paint protection and hydrophobic surface', 6000, 8000, 10000, 1),
      ('Interior Detailing', 'Deep cleaning of seats, dashboard, carpets and air vents', 1500, 2000, 2500, 1),
      ('Engine Cleaning', 'Engine bay degreasing and detailing', 500, 700, 900, 1)
    ON DUPLICATE KEY UPDATE name = VALUES(name)
  `);
  console.log('  ✓ Services seeded (5 services)');

  // ─── Inventory ────────────────────────────────────
  await conn.query(`
    INSERT INTO inventory (product_name, unit, quantity, low_stock_threshold) VALUES
      ('Teflon Spray', 'ml', 500, 50),
      ('Ceramic Pro 9H', 'ml', 200, 30),
      ('PPF Film Roll', 'ft', 100, 20),
      ('Dashboard Polish', 'ml', 300, 50),
      ('Glass Cleaner', 'ml', 1000, 100),
      ('Microfiber Cloth', 'pcs', 50, 10),
      ('Car Shampoo', 'ltr', 20, 5),
      ('Wax Polish', 'ml', 500, 50),
      ('Tire Shine', 'ml', 400, 50),
      ('Interior Cleaner', 'ml', 600, 50)
    ON DUPLICATE KEY UPDATE product_name = VALUES(product_name)
  `);
  console.log('  ✓ Inventory seeded (10 products)');

  // ─── Package ──────────────────────────────────────
  await conn.query(`
    INSERT INTO packages (name, description, price_hatchback, price_sedan, price_suv, wash_count, wax_count, is_published) VALUES
      ('Premium Care', 'Complete car care with ceramic coating and exterior wash. Includes 2 complimentary washes and 1 wax treatment.', 5000, 7000, 9000, 2, 1, 1)
    ON DUPLICATE KEY UPDATE name = VALUES(name)
  `);
  console.log('  ✓ Package seeded (Premium Care)');

  // Link package to services (Car Wash Basic + Ceramic Coating)
  const [pkgs] = await conn.query(`SELECT id FROM packages WHERE name = 'Premium Care' LIMIT 1`);
  const [svcWash] = await conn.query(`SELECT id FROM services WHERE name = 'Car Wash Basic' LIMIT 1`);
  const [svcCeramic] = await conn.query(`SELECT id FROM services WHERE name = 'Ceramic Coating' LIMIT 1`);

  if (pkgs.length && svcWash.length && svcCeramic.length) {
    await conn.query(`
      INSERT INTO package_services (package_id, service_id) VALUES
        (?, ?), (?, ?)
      ON DUPLICATE KEY UPDATE package_id = package_id
    `, [pkgs[0].id, svcWash[0].id, pkgs[0].id, svcCeramic[0].id]);
    console.log('  ✓ Package services linked');
  }

  await conn.end();
  console.log('\n✓ Seed completed successfully.');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
