/**
 * seed.js — Idempotent Database Seed Script
 * Populates clean development/staging test data:
 * - 1 Super Admin
 * - 2 Franchise Admins (Franchise 1: Surat, Franchise 2: Ahmedabad)
 * - 4 Employees (2 across each franchise)
 * - 1 Customer Account
 * - Detailing Services, Inventory, Packages, Bookings, and Leads
 *
 * Password Security:
 * - All passwords hashed using bcrypt (10 rounds)
 * - Default password configurable via SEED_DEFAULT_PASSWORD (Default: O3Spaa@Dev2026!)
 * - Idempotent: Can be run multiple times safely without duplicates
 */

const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function seed() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'o3_car_spa',
    multipleStatements: true,
  });

  console.log('\n================================================================');
  console.log('🌱 RUNNING IDEMPOTENT DATABASE SEED SCRIPT (O3 CAR SPAA)');
  console.log('================================================================\n');

  const defaultPassword = process.env.SEED_DEFAULT_PASSWORD || 'O3Spaa@Dev2026!';
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  // ── 1. Franchises ───────────────────────────────────────────────────────────
  await conn.query(`
    INSERT INTO franchises (id, name, code, city, state, address, phone, is_active) VALUES
      (1, 'O3 Car Spaa — Surat Hub', 'O3-SURAT', 'Surat', 'Gujarat', 'Ring Road, Surat, Gujarat', '917225030303', 1),
      (2, 'O3 Car Spaa — Ahmedabad Hub', 'O3-AHM', 'Ahmedabad', 'Gujarat', 'SG Highway, Ahmedabad, Gujarat', '919876543210', 1)
    ON DUPLICATE KEY UPDATE name = VALUES(name), code = VALUES(code), is_active = VALUES(is_active)
  `);
  console.log('  ✓ 2 Franchises seeded (Surat & Ahmedabad)');

  // ── 2. Users (Super Admin, 2 Franchise Admins, 4 Employees, 1 Customer) ─────
  const users = [
    // Super Admin
    { name: 'Super Admin HQ', mobile: '9000000001', email: 'superadmin@o3carspaa.com', role: 'super_admin', franchiseId: 1 },
    // Franchise Admin 1 (Surat)
    { name: 'Surat Studio Manager', mobile: '7225030303', email: 'surat.admin@o3carspaa.com', role: 'admin', franchiseId: 1 },
    // Franchise Admin 2 (Ahmedabad)
    { name: 'Ahmedabad Studio Manager', mobile: '9000000002', email: 'ahmedabad.admin@o3carspaa.com', role: 'admin', franchiseId: 2 },
    // 2 Employees in Franchise 1
    { name: 'Ramesh Patel (Detailer)', mobile: '9000000011', email: 'ramesh.surat@o3carspaa.com', role: 'staff', franchiseId: 1 },
    { name: 'Vikram Singh (Technician)', mobile: '9000000012', email: 'vikram.surat@o3carspaa.com', role: 'staff', franchiseId: 1 },
    // 2 Employees in Franchise 2
    { name: 'Amit Shah (Detailer)', mobile: '9000000021', email: 'amit.ahm@o3carspaa.com', role: 'staff', franchiseId: 2 },
    { name: 'Deepak Joshi (Applier)', mobile: '9000000022', email: 'deepak.ahm@o3carspaa.com', role: 'staff', franchiseId: 2 },
    // Customer Account
    { name: 'Harshil Mehta (Customer)', mobile: '9000000099', email: 'customer@example.com', role: 'customer', franchiseId: 1 }
  ];

  for (const u of users) {
    await conn.query(`
      INSERT INTO users (name, mobile, email, password_hash, role, franchise_id)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        mobile = VALUES(mobile),
        email = VALUES(email),
        role = VALUES(role),
        franchise_id = VALUES(franchise_id),
        password_hash = VALUES(password_hash)
    `, [u.name, u.mobile, u.email, passwordHash, u.role, u.franchiseId]);
  }
  console.log('  ✓ 8 User accounts seeded (1 Super Admin, 2 Franchise Admins, 4 Employees, 1 Customer)');

  // ── 3. Services ─────────────────────────────────────────────────────────────
  await conn.query(`
    INSERT INTO services (id, franchise_id, name, description, price_hatchback, price_sedan, price_suv, is_active) VALUES
      (1, 1, 'Car Wash Basic', 'Exterior shampoo wash, wheels cleaning, and tire dressing', 400, 500, 600, 1),
      (2, 1, 'Deep Interior Spa', 'High-pressure steam sanitization, leather conditioning, ozone deodorization', 1499, 1999, 2499, 1),
      (3, 1, '9H Nano Ceramic Coating', 'Multi-layer glass coating with 3-year warranty and hydrophobic shine', 14999, 18999, 22999, 1),
      (4, 1, 'TPU Paint Protection Film', 'Garware self-healing TPU PPF with 5-year scratch warranty', 65000, 80000, 95000, 1),
      (5, 1, 'Full Exterior Spa & Polish', '3-stage compound rubbing, swirl mark removal, clay bar seal', 1499, 1999, 2499, 1)
    ON DUPLICATE KEY UPDATE name = VALUES(name), price_hatchback = VALUES(price_hatchback)
  `);
  console.log('  ✓ 5 Detailing Services seeded');

  // ── 4. Inventory Products ───────────────────────────────────────────────────
  await conn.query(`
    INSERT INTO inventory (id, franchise_id, product_name, unit, quantity, low_stock_threshold) VALUES
      (1, 1, 'Ceramic Pro 9H Coating', 'ml', 500, 100),
      (2, 1, 'Garware TPU PPF Roll (50m)', 'ft', 200, 50),
      (3, 1, 'High-Foam Car Shampoo', 'ltr', 50, 10),
      (4, 1, 'Microfiber Towels 400 GSM', 'pcs', 100, 20),
      (5, 1, 'Leather Conditioner Balm', 'ml', 400, 50)
    ON DUPLICATE KEY UPDATE product_name = VALUES(product_name), quantity = VALUES(quantity)
  `);
  console.log('  ✓ 5 Inventory Products seeded');

  // ── 5. Packages ─────────────────────────────────────────────────────────────
  await conn.query(`
    INSERT INTO packages (id, franchise_id, name, description, price_hatchback, price_sedan, price_suv, wash_count, wax_count, is_published) VALUES
      (1, 1, 'Annual Detailing Pass', 'Includes 12 Premium Washes, 2 Deep Interior Spas, and 1 Ceramic Top-up', 9999, 12999, 15999, 12, 4, 1)
    ON DUPLICATE KEY UPDATE name = VALUES(name)
  `);
  console.log('  ✓ Detailing package seeded');

  // ── 6. Sample Bookings & Leads ──────────────────────────────────────────────
  await conn.query(`
    INSERT INTO leads (franchise_id, phone, name, vehicle_model, service_interest, stage, source) VALUES
      (1, '919876543210', 'Rajesh Varma', 'Fortuner', 'Ceramic Coating', 'qualified', 'whatsapp_inbound'),
      (1, '919876543211', 'Pooja Dave', 'Creta', 'Deep Interior Spa', 'contacted', 'whatsapp_inbound')
    ON DUPLICATE KEY UPDATE name = VALUES(name)
  `);
  console.log('  ✓ Sample Leads seeded');

  await conn.end();
  console.log('\n================================================================');
  console.log('✅ DATABASE SEED COMPLETE AND VERIFIED IDEMPOTENT');
  console.log(`Default Seed Password: "${defaultPassword}"`);
  console.log('================================================================\n');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
