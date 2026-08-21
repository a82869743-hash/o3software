/**
 * Run Package System V2 migrations (052 + 053)
 * Usage: node run_migration_v2.js
 * Requires: .env with DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
    charset: 'utf8mb4',
  });
  console.log('✓ Connected to', process.env.DB_NAME);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 1: Schema migration (052)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ Running 052_package_system_v2 ━━━');
  
  // Helper procedure for safe column addition
  await conn.query(`DROP PROCEDURE IF EXISTS _add_col_if_missing`);
  await conn.query(`
    CREATE PROCEDURE _add_col_if_missing(
      IN tbl VARCHAR(64), IN col VARCHAR(64), IN col_def VARCHAR(255)
    )
    BEGIN
      SET @q = CONCAT('ALTER TABLE \`', tbl, '\` ADD COLUMN \`', col, '\` ', col_def);
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col
      ) THEN
        PREPARE stmt FROM @q;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
      END IF;
    END
  `);
  console.log('  ✓ Created helper procedure');

  await conn.query(`CALL _add_col_if_missing('packages', 'paid_wash_count', 'INT UNSIGNED NOT NULL DEFAULT 0 AFTER wax_count')`);
  await conn.query(`CALL _add_col_if_missing('packages', 'sort_order', 'INT NOT NULL DEFAULT 0 AFTER visible_to_customer')`);
  console.log('  ✓ packages table updated');

  await conn.query(`
    CREATE TABLE IF NOT EXISTS package_pricing (
      id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      package_id   INT UNSIGNED NOT NULL,
      car_type     ENUM('SMALL_HATCHBACK','MEDIUM_HATCHBACK','SEDAN_SUV','PREMIUM_SEDAN','LARGE_CAR') NOT NULL,
      pricing_type ENUM('basic','premium') NOT NULL DEFAULT 'basic',
      price        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
      UNIQUE KEY uq_pkg_car_pricing (package_id, car_type, pricing_type),
      INDEX idx_package_id (package_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('  ✓ package_pricing table created');

  await conn.query(`CALL _add_col_if_missing('package_requests', 'pricing_type', "ENUM('basic','premium') NOT NULL DEFAULT 'basic' AFTER price")`);
  await conn.query(`CALL _add_col_if_missing('package_requests', 'car_type', 'VARCHAR(50) NULL AFTER pricing_type')`);
  console.log('  ✓ package_requests table updated');

  await conn.query(`CALL _add_col_if_missing('user_packages', 'pricing_type', "ENUM('basic','premium') NULL DEFAULT 'basic'")`);
  await conn.query(`CALL _add_col_if_missing('user_packages', 'car_type', 'VARCHAR(50) NULL')`);
  console.log('  ✓ user_packages table updated');

  await conn.query(`DROP PROCEDURE IF EXISTS _add_col_if_missing`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 2: Ensure required services exist
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ Ensuring required services exist ━━━');

  const requiredServices = [
    { name: 'Body Wax Coat', description: 'Premium body wax coating for vehicle paint protection' },
    { name: 'Two Wheeler Wash', description: 'Complete two-wheeler foam wash' },
    { name: 'Two Wheeler Wax Coat', description: 'Wax coat polish for two-wheelers' },
    { name: 'Body Hybrid Ceramic Wax Coat', description: 'Hybrid ceramic wax coat for superior paint protection' },
    { name: 'Deep Cleaning', description: 'Full interior and exterior deep cleaning service' },
  ];

  for (const svc of requiredServices) {
    const [existing] = await conn.query('SELECT id FROM services WHERE name = ?', [svc.name]);
    if (existing.length === 0) {
      await conn.query(
        'INSERT INTO services (name, description, is_active) VALUES (?, ?, 1)',
        [svc.name, svc.description]
      );
      console.log(`  ✓ Created service: "${svc.name}"`);
    } else {
      console.log(`  ○ Service exists: "${svc.name}" (id=${existing[0].id})`);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STEP 3: Seed packages (inline — not from SQL file)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('\n━━━ Seeding AutoHerb Annual Car Care packages ━━━');

  // Deactivate old packages
  await conn.query(`UPDATE packages SET is_active = 0, is_published = 0, visible_to_customer = 0 WHERE 1=1`);
  console.log('  ✓ Deactivated old packages');

  // Insert 5 new packages
  const packageDefs = [
    { name: 'Bronze Package', description: 'Pay For 3 Car Foam Wash', paid_wash_count: 3, sort_order: 1 },
    { name: 'Silver Package', description: 'Pay For 5 Car Foam Wash', paid_wash_count: 5, sort_order: 2 },
    { name: 'Gold Package', description: 'Pay For 8 Car Foam Wash', paid_wash_count: 8, sort_order: 3 },
    { name: 'Diamond Package', description: 'Pay For 10 Car Foam Wash', paid_wash_count: 10, sort_order: 4 },
    { name: 'Platinum Package', description: 'Pay For 12 Car Foam Wash', paid_wash_count: 12, sort_order: 5 },
  ];

  const pkgIds = {};
  for (const pkg of packageDefs) {
    // Use upsert: if name already exists, re-activate and update it
    const [result] = await conn.query(
      `INSERT INTO packages (name, description, paid_wash_count, wash_count, wax_count, is_published, is_active, visible_to_customer, sort_order)
       VALUES (?, ?, ?, 0, 0, 1, 1, 1, ?)
       ON DUPLICATE KEY UPDATE
         description = VALUES(description),
         paid_wash_count = VALUES(paid_wash_count),
         is_published = 1, is_active = 1, visible_to_customer = 1,
         sort_order = VALUES(sort_order)`,
      [pkg.name, pkg.description, pkg.paid_wash_count, pkg.sort_order]
    );
    // Get the ID (insertId is 0 on update, so we need to query)
    const [rows] = await conn.query('SELECT id FROM packages WHERE name = ?', [pkg.name]);
    pkgIds[pkg.name] = rows[0].id;
    console.log(`  ✓ Upserted package: "${pkg.name}" (id=${pkgIds[pkg.name]})`);
  }

  // ━━━ PRICING MATRIX ━━━
  console.log('\n━━━ Inserting pricing matrix ━━━');
  const carTypes = ['SMALL_HATCHBACK', 'MEDIUM_HATCHBACK', 'SEDAN_SUV', 'PREMIUM_SEDAN', 'LARGE_CAR'];
  
  const pricingData = {
    'Bronze Package': {
      basic:   [1200, 1350, 1500, 1800, 1800],
      premium: [1650, 1800, 1950, 2250, 2250],
    },
    'Silver Package': {
      basic:   [2000, 2250, 2500, 3000, 3000],
      premium: [2750, 3000, 3250, 3750, 3750],
    },
    'Gold Package': {
      basic:   [3200, 3600, 4000, 4800, 4800],
      premium: [4400, 4800, 5200, 6000, 6000],
    },
    'Diamond Package': {
      basic:   [4000, 4500, 5000, 6000, 6000],
      premium: [5500, 6000, 6500, 7500, 7500],
    },
    'Platinum Package': {
      basic:   [4800, 5400, 6000, 7200, 7200],
      premium: [6600, 7200, 7800, 9000, 9000],
    },
  };

  // Clear existing pricing for these packages
  const allPkgIds = Object.values(pkgIds);
  if (allPkgIds.length > 0) {
    await conn.query(`DELETE FROM package_pricing WHERE package_id IN (?)`, [allPkgIds]);
  }

  let pricingCount = 0;
  for (const [pkgName, tiers] of Object.entries(pricingData)) {
    const pid = pkgIds[pkgName];
    for (const [tier, prices] of Object.entries(tiers)) {
      for (let i = 0; i < carTypes.length; i++) {
        await conn.query(
          'INSERT INTO package_pricing (package_id, car_type, pricing_type, price) VALUES (?, ?, ?, ?)',
          [pid, carTypes[i], tier, prices[i]]
        );
        pricingCount++;
      }
    }
  }
  console.log(`  ✓ Inserted ${pricingCount} pricing rows`);

  // ━━━ COMPLIMENTARY SERVICES ━━━
  console.log('\n━━━ Setting up complimentary services ━━━');

  // Look up service IDs
  async function getSvcId(name) {
    const [rows] = await conn.query('SELECT id FROM services WHERE name = ? AND is_active = 1 LIMIT 1', [name]);
    if (rows.length === 0) {
      // Fallback: fuzzy match
      const [fuzzy] = await conn.query('SELECT id, name FROM services WHERE name LIKE ? AND is_active = 1 LIMIT 1', [`%${name}%`]);
      if (fuzzy.length > 0) {
        console.log(`    (fuzzy match: "${name}" → "${fuzzy[0].name}" id=${fuzzy[0].id})`);
        return fuzzy[0].id;
      }
      console.warn(`  ⚠ Service not found: "${name}" — skipping`);
      return null;
    }
    return rows[0].id;
  }

  const svcFoamWash = await getSvcId('Exterior Body Foam Wash');
  const svcWaxCoat = await getSvcId('Body Wax Coat');
  const svcTwWash = await getSvcId('Two Wheeler Wash');
  const svcTwWax = await getSvcId('Two Wheeler Wax Coat');
  const svcCeramic = await getSvcId('Body Hybrid Ceramic Wax Coat');
  const svcDeepClean = await getSvcId('Deep Cleaning');

  // Clear existing package_services for our packages
  if (allPkgIds.length > 0) {
    await conn.query(`DELETE FROM package_services WHERE package_id IN (?)`, [allPkgIds]);
  }

  // Define complimentary and total package service map (Total Washes = Paid Washes + Complementary Washes)
  const compMap = {
    'Bronze Package': [
      { svcId: svcFoamWash, count: 4 }, // 3 paid + 1 comp
      { svcId: svcWaxCoat, count: 1 },
    ],
    'Silver Package': [
      { svcId: svcFoamWash, count: 7 }, // 5 paid + 2 comp
      { svcId: svcWaxCoat, count: 2 },
      { svcId: svcTwWash, count: 1 },
    ],
    'Gold Package': [
      { svcId: svcFoamWash, count: 12 }, // 8 paid + 4 comp
      { svcId: svcWaxCoat, count: 3 },
      { svcId: svcTwWash, count: 1 },
      { svcId: svcTwWax, count: 1 },
    ],
    'Diamond Package': [
      { svcId: svcFoamWash, count: 16 }, // 10 paid + 6 comp
      { svcId: svcWaxCoat, count: 2 },
      { svcId: svcTwWash, count: 2 },
      { svcId: svcTwWax, count: 1 },
      { svcId: svcCeramic, count: 1 },
    ],
    'Platinum Package': [
      { svcId: svcFoamWash, count: 20 }, // 12 paid + 8 comp
      { svcId: svcWaxCoat, count: 3 },
      { svcId: svcTwWash, count: 2 },
      { svcId: svcTwWax, count: 1 },
      { svcId: svcCeramic, count: 1 },
      { svcId: svcDeepClean, count: 1 },
    ],
  };

  let svcCount = 0;
  for (const [pkgName, services] of Object.entries(compMap)) {
    const pid = pkgIds[pkgName];
    for (const { svcId, count } of services) {
      if (svcId) {
        await conn.query(
          'INSERT INTO package_services (package_id, service_id, total_count) VALUES (?, ?, ?)',
          [pid, svcId, count]
        );
        svcCount++;
      }
    }
  }
  console.log(`  ✓ Inserted ${svcCount} complimentary service rows`);

  // ━━━ VERIFICATION ━━━
  console.log('\n━━━ Verification ━━━');
  const [packages] = await conn.query(`SELECT id, name, paid_wash_count, sort_order FROM packages WHERE is_active = 1 ORDER BY sort_order`);
  packages.forEach(p => console.log(`  ${p.sort_order}. ${p.name} (id=${p.id}, paid_washes=${p.paid_wash_count})`));

  const [pricing] = await conn.query(`SELECT COUNT(*) as cnt FROM package_pricing`);
  console.log(`  Total pricing rows: ${pricing[0].cnt}`);

  const [services] = await conn.query(`
    SELECT p.name, GROUP_CONCAT(CONCAT(s.name, ' x', ps.total_count) SEPARATOR ', ') as details
    FROM packages p
    JOIN package_services ps ON ps.package_id = p.id
    JOIN services s ON s.id = ps.service_id
    WHERE p.is_active = 1
    GROUP BY p.id, p.name
    ORDER BY p.sort_order
  `);
  console.log('\n  Complimentary Services:');
  services.forEach(s => console.log(`    ${s.name}: ${s.details}`));

  await conn.end();
  console.log('\n✅ All migrations complete!');
}

run().catch(err => {
  console.error('❌ Migration failed:', err.message);
  console.error(err);
  process.exit(1);
});
