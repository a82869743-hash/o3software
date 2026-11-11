const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function seedO3Catalog() {
  console.log('--- Seeding O3 Car Spaa Official Services & Packages Catalog ---');

  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'o3_car_spa',
    waitForConnections: true,
    connectionLimit: 10,
  });

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1. Deactivate old non-O3 services or update existing ones
    console.log('1. Cleaning old services...');
    await conn.query('UPDATE services SET is_active = 0');

    // 2. Insert Official O3 Detailing Services
    const o3Services = [
      { name: 'Full Foam Wash', desc: 'High-pressure foam wash, wheel detailing & interior vacuuming', h: 400, mh: 450, s: 500, ps: 550, suv: 600 },
      { name: 'Body Wax Coat', desc: 'High-gloss protective carnauba wax coat', h: 800, mh: 900, s: 1000, ps: 1100, suv: 1200 },
      { name: 'Body Hybrid Ceramic Wax Coat', desc: 'Hydrophobic SiO2 hybrid ceramic wax protection', h: 1500, mh: 1650, s: 1800, ps: 2000, suv: 2200 },
      { name: 'Deep Cleaning & Interior Detailing', desc: 'Steam extraction, seat scrubbing & AC sanitization', h: 1800, mh: 2000, s: 2200, ps: 2500, suv: 2800 },
      { name: '9H Ceramic Coating', desc: 'Multi-layer 9H nano ceramic paint protection with 3-yr warranty', h: 6500, mh: 7500, s: 8000, ps: 9000, suv: 10000 },
      { name: 'PPF Paint Protection Film', desc: 'Self-healing ultra-clear TPU paint protection film', h: 45000, mh: 50000, s: 55000, ps: 60000, suv: 65000 },
      { name: 'Underbody Anti-Rust Coating', desc: 'Heavy-duty rubberized chassis anti-corrosion coating', h: 1200, mh: 1350, s: 1500, ps: 1650, suv: 1800 },
      { name: 'Glass Hydrophobic Coating', desc: 'Rain-repellent windshield & side glass treatment', h: 600, mh: 700, s: 800, ps: 900, suv: 1000 },
      { name: 'Engine Bay Detailing & Dressing', desc: 'Safe engine degreasing and protective plastic dressing', h: 500, mh: 600, s: 700, ps: 800, suv: 900 },
      { name: 'Two Wheeler Wash', desc: 'High pressure bike & scooter foam wash', h: 150, mh: 150, s: 150, ps: 150, suv: 150 },
      { name: 'Two Wheeler Wax Coat', desc: 'Bike & scooter body wax polish', h: 250, mh: 250, s: 250, ps: 250, suv: 250 },
    ];

    for (const svc of o3Services) {
      await conn.query(`
        INSERT INTO services (name, description, price_hatchback, price_medium_hatchback, price_sedan, price_premium_sedan, price_suv, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE 
          description = VALUES(description),
          price_hatchback = VALUES(price_hatchback),
          price_medium_hatchback = VALUES(price_medium_hatchback),
          price_sedan = VALUES(price_sedan),
          price_premium_sedan = VALUES(price_premium_sedan),
          price_suv = VALUES(price_suv),
          is_active = 1
      `, [svc.name, svc.desc, svc.h, svc.mh, svc.s, svc.ps, svc.suv]);
    }
    console.log('✓ 11 Official O3 Detailing Services Seeded!');

    // 3. Deactivate old packages
    await conn.query('UPDATE packages SET is_active = 0, is_published = 0, visible_to_customer = 0');

    // 4. Seed 5 Official O3 Annual Packages
    const o3Packages = [
      {
        name: 'Bronze Package',
        desc: 'Pay For 3 Car Foam Washes (Includes 4 Foam Washes + 1 Free Body Wax Coat)',
        washes: 4, wax: 1, paid: 3, sort: 1,
        pricing: { SMALL_HATCHBACK: 1200, MEDIUM_HATCHBACK: 1350, SEDAN_SUV: 1500, PREMIUM_SEDAN: 1800, LARGE_CAR: 1800 }
      },
      {
        name: 'Silver Package',
        desc: 'Pay For 5 Car Foam Washes (Includes 7 Washes + 2 Wax Coats + 1 Two Wheeler Wash)',
        washes: 7, wax: 2, paid: 5, sort: 2,
        pricing: { SMALL_HATCHBACK: 2000, MEDIUM_HATCHBACK: 2250, SEDAN_SUV: 2500, PREMIUM_SEDAN: 3000, LARGE_CAR: 3000 }
      },
      {
        name: 'Gold Package',
        desc: 'Pay For 8 Car Foam Washes (Includes 12 Washes + 3 Wax Coats + 1 Two Wheeler Wash + 1 Two Wheeler Wax)',
        washes: 12, wax: 3, paid: 8, sort: 3,
        pricing: { SMALL_HATCHBACK: 3200, MEDIUM_HATCHBACK: 3600, SEDAN_SUV: 4000, PREMIUM_SEDAN: 4800, LARGE_CAR: 4800 }
      },
      {
        name: 'Diamond Package',
        desc: 'Pay For 10 Car Foam Washes (Includes 16 Washes + 2 Wax Coats + 2 Two Wheeler Washes + 1 Ceramic Coat)',
        washes: 16, wax: 2, paid: 10, sort: 4,
        pricing: { SMALL_HATCHBACK: 4000, MEDIUM_HATCHBACK: 4500, SEDAN_SUV: 5000, PREMIUM_SEDAN: 6000, LARGE_CAR: 6000 }
      },
      {
        name: 'Platinum Package',
        desc: 'Pay For 12 Car Foam Washes (Includes 20 Washes + 3 Wax Coats + 2 Two Wheeler Washes + 1 Ceramic + 1 Deep Clean)',
        washes: 20, wax: 3, paid: 12, sort: 5,
        pricing: { SMALL_HATCHBACK: 4800, MEDIUM_HATCHBACK: 5400, SEDAN_SUV: 6000, PREMIUM_SEDAN: 7200, LARGE_CAR: 7200 }
      },
    ];

    for (const pkg of o3Packages) {
      const [res] = await conn.query(`
        INSERT INTO packages (name, description, wash_count, wax_count, paid_wash_count, is_published, is_active, visible_to_customer, sort_order, price_hatchback, price_medium_hatchback, price_sedan, price_premium_sedan, price_suv)
        VALUES (?, ?, ?, ?, ?, 1, 1, 1, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          description = VALUES(description),
          wash_count = VALUES(wash_count),
          wax_count = VALUES(wax_count),
          paid_wash_count = VALUES(paid_wash_count),
          is_published = 1, is_active = 1, visible_to_customer = 1,
          sort_order = VALUES(sort_order),
          price_hatchback = VALUES(price_hatchback),
          price_medium_hatchback = VALUES(price_medium_hatchback),
          price_sedan = VALUES(price_sedan),
          price_premium_sedan = VALUES(price_premium_sedan),
          price_suv = VALUES(price_suv)
      `, [
        pkg.name, pkg.desc, pkg.washes, pkg.wax, pkg.paid, pkg.sort,
        pkg.pricing.SMALL_HATCHBACK, pkg.pricing.MEDIUM_HATCHBACK, pkg.pricing.SEDAN_SUV, pkg.pricing.PREMIUM_SEDAN, pkg.pricing.LARGE_CAR
      ]);

      const pkgId = res.insertId || (await conn.query('SELECT id FROM packages WHERE name = ?', [pkg.name]))[0][0].id;

      // Add matrix pricing rows into package_pricing
      for (const [carType, pVal] of Object.entries(pkg.pricing)) {
        await conn.query(`
          INSERT INTO package_pricing (package_id, car_type, pricing_type, price)
          VALUES (?, ?, 'basic', ?)
          ON DUPLICATE KEY UPDATE price = VALUES(price)
        `, [pkgId, carType, pVal]);
      }
    }

    console.log('✓ 5 Official O3 Car Spaa Annual Packages Seeded!');

    await conn.commit();
    console.log('\n🎉 O3 CATALOG SEED COMPLETED SUCCESSFULLY!');
  } catch (err) {
    await conn.rollback();
    console.error('❌ O3 Catalog Seed failed:', err);
  } finally {
    conn.release();
    await pool.end();
  }
}

seedO3Catalog();
