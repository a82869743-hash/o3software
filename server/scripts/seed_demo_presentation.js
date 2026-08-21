const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function seedDemoData() {
  console.log('Seeding demo accounts for client presentation...\n');

  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Test1234',
    database: process.env.DB_NAME || 'o3_car_spa',
  });

  const commonPasswordHash = await bcrypt.hash('12345', 10);

  // 1. Admin Users
  await pool.query(`
    INSERT INTO users (name, mobile, email, password_hash, role) VALUES
      ('Sharanpalsingh Sodhi', '7225030303', 'o3carspavvn@gmail.com', ?, 'admin'),
      ('Franchise Manager', '9000000001', 'manager@o3carspa.com', ?, 'admin')
    ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash)
  `, [commonPasswordHash, commonPasswordHash]);
  console.log('  ✓ Seeded 2 Admin Users');

  // 2. Staff Users & Staff Profiles
  await pool.query(`
    INSERT INTO users (name, mobile, email, password_hash, role) VALUES
      ('Rajesh Sharma', '9000000003', 'rajesh@o3carspa.com', ?, 'staff'),
      ('Vikram Patel', '9000000004', 'vikram@o3carspa.com', ?, 'staff')
    ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash)
  `, [commonPasswordHash, commonPasswordHash]);

  const [staffRows] = await pool.query("SELECT id FROM users WHERE role = 'staff'");
  for (const s of staffRows) {
    await pool.query(`
      INSERT INTO staff_profiles (user_id, specialisations) VALUES (?, 'Car Detailing, Ceramic Coating, Washing')
      ON DUPLICATE KEY UPDATE specialisations = VALUES(specialisations)
    `, [s.id]);
  }
  console.log('  ✓ Seeded 2 Staff Users & Profiles');

  // 3. Customer Users & Loyalty Records
  await pool.query(`
    INSERT INTO users (name, mobile, email, password_hash, role) VALUES
      ('Suryaansh Patel', '9000000002', 'suryaansh@gmail.com', ?, 'customer'),
      ('Ananya Verma', '9898000001', 'ananya@gmail.com', ?, 'customer')
    ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash)
  `, [commonPasswordHash, commonPasswordHash]);

  const [custRows] = await pool.query("SELECT id, name FROM users WHERE role = 'customer'");
  for (const c of custRows) {
    await pool.query(`
      INSERT INTO loyalty (customer_id, credits, free_washes, wax_count)
      VALUES (?, 250, 2, 1)
      ON DUPLICATE KEY UPDATE credits = 250, free_washes = 2
    `, [c.id]);
  }
  console.log('  ✓ Seeded 2 Customers & Loyalty Accounts');

  // 4. Vehicles
  if (custRows.length >= 2) {
    await pool.query(`
      INSERT INTO vehicles (registration_no, customer_id, brand, model, registration_year) VALUES
        ('GJ07AB1234', ?, 'Hyundai', 'Creta', 2023),
        ('GJ01CD5678', ?, 'Honda', 'City', 2022),
        ('GJ23EF9012', ?, 'Mahindra', 'Thar', 2024)
      ON DUPLICATE KEY UPDATE brand = VALUES(brand), model = VALUES(model)
    `, [custRows[0].id, custRows[0].id, custRows[1].id]);
    console.log('  ✓ Seeded Customer Demo Vehicles');
  }

  // 5. Vendors
  await pool.query(`
    INSERT INTO vendors (name, phone, email, service_type, address) VALUES
      ('Soni Auto Distributors', '9879000001', 'contact@soniauto.com', 'Spare Parts & Accessories', 'GIDC Phase 2, Vitthal Udyognagar, Anand'),
      ('3M Car Supplies India', '9879000002', 'sales@3mcarcare.com', 'PPF & Ceramic Chemicals', 'S.G. Highway, Ahmedabad')
    ON DUPLICATE KEY UPDATE name = VALUES(name);
  `);
  console.log('  ✓ Seeded Demo Vendors');


  console.log('\n✅ All Demo Users & Data Seeded Successfully!');
  console.log('\n--- Login Credentials for Presentation ---');
  console.log('Admin 1:    7225030303 / Password: 12345');
  console.log('Admin 2:    9000000001 / Password: 12345');
  console.log('Staff 1:    9000000003 / Password: 12345');
  console.log('Staff 2:    9000000004 / Password: 12345');
  console.log('Customer 1: 9000000002 / Password: 12345');
  console.log('Customer 2: 9898000001 / Password: 12345');

  await pool.end();
}

seedDemoData().catch(e => console.error('Seed demo failed:', e));
