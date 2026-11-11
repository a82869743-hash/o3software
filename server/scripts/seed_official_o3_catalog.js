const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

async function seedO3Catalog() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'o3_car_spa',
  });

  console.log('Connected to MySQL. Seeding ONLY official O3 Services & Packages from images...\n');

  // Clear existing services and packages
  await conn.query('DELETE FROM package_services');
  await conn.query('DELETE FROM packages');
  await conn.query('DELETE FROM services');

  // Function to calculate tier prices from SUV price
  // Hatch (~65%), Med Hatch (~75%), Sedan (~85%), Prem Sedan (~92%), SUV (100%)
  function calcPrices(suvPrice) {
    const pSUV = Number(suvPrice);
    if (pSUV <= 0) return { hb: 0, medHb: 0, sedan: 0, premSedan: 0, suv: 0 };
    
    const roundPrice = (val) => {
      if (val > 10000) return Math.round(val / 500) * 500;
      if (val > 1000) return Math.round(val / 100) * 100;
      return Math.round(val / 50) * 50;
    };

    return {
      hb: roundPrice(pSUV * 0.65),
      medHb: roundPrice(pSUV * 0.75),
      sedan: roundPrice(pSUV * 0.85),
      premSedan: roundPrice(pSUV * 0.92),
      suv: pSUV
    };
  }

  // ─── EXACT 47 SERVICES FROM IMAGE 1 (NO EXTRA SERVICES) ───────────────────
  const servicesData = [
    // SERVICES
    { name: 'Exterior Wash + Shampoo & Vacuum', suv: 500, duration: 45 },
    { name: 'Intensive Shiny Interior', suv: 2500, duration: 120 },
    { name: 'Ozone Treatment & Odour Removal', suv: 800, duration: 40 },
    { name: 'Leather Care Treatment', suv: 800, duration: 45 },
    { name: 'Head Light Restoration', suv: 1200, duration: 60 },

    // COLOR PROTECTION & COATING TREATMENT
    { name: 'Rodent Repellant Coating', suv: 1200, duration: 45 },
    { name: 'Engine Coating', suv: 3000, duration: 60 },
    { name: 'Alloy Wheel Coating', suv: 3500, duration: 90 },
    { name: 'Windshield Coating', suv: 3000, duration: 60 },
    { name: 'Leather Shield', suv: 6000, duration: 120 },
    { name: 'Fabric Shield', suv: 6000, duration: 120 },
    { name: 'Trim Shield', suv: 4000, duration: 90 },
    { name: 'Machine Polish & Wax', suv: 2000, duration: 90 },
    { name: 'Compounding Hi-tech Wax (2 Steps)', suv: 3500, duration: 150 },
    { name: 'O3 Coating (3 Steps)', suv: 7000, duration: 240 },

    // CERAMIC COATING
    { name: '1 Year - Ceramic Shield', suv: 12000, duration: 360, is_premium: 1 },
    { name: '2 Years - Ceramic Shield', suv: 14000, duration: 360, is_premium: 1 },
    { name: '3 Years - Ceramic Shield', suv: 20000, duration: 480, is_premium: 1 },
    { name: '5 Years - Ceramic Shield', suv: 30000, duration: 480, is_premium: 1 },
    { name: '2 YEARS - Ceramic Shield - 1 CoatCare', suv: 25000, duration: 480, is_premium: 1 },
    { name: '3 YEARS - Ceramic Shield - 2 CoatCare', suv: 35000, duration: 480, is_premium: 1 },
    { name: '5 YEARS - Ceramic Shield - 4 CoatCare', suv: 40000, duration: 480, is_premium: 1 },

    // GRAPHENE COATING
    { name: '2 YEARS - Graphene Armor', suv: 18000, duration: 480, is_premium: 1 },
    { name: '3 YEARS - Graphene Armor', suv: 22000, duration: 480, is_premium: 1 },
    { name: '5 YEARS - Graphene Armor', suv: 30000, duration: 480, is_premium: 1 },
    { name: '2 YEARS - Graphene Armor - 1 CoatCare', suv: 28000, duration: 480, is_premium: 1 },
    { name: '3 YEARS - Graphene Armor - 2 CoatCare', suv: 40000, duration: 480, is_premium: 1 },
    { name: '5 YEARS - Graphene Armor - 4 CoatCare', suv: 45000, duration: 480, is_premium: 1 },

    // MAINTENANCE COATING
    { name: 'Maintenance Coating - 1 Time', suv: 1500, duration: 90 },
    { name: 'Ceramic Maintenance - 1 Time', suv: 8000, duration: 180 },
    { name: 'Graphene Maintenance - 1 Time', suv: 9000, duration: 180 },

    // PPF - CLEAR (TPH)
    { name: 'PPF - 3 Years (TPH - Thermoplastic Hybrid)', suv: 70000, duration: 720, is_premium: 1 },
    { name: 'PPF - 5 Years (TPH - Thermoplastic Hybrid)', suv: 90000, duration: 720, is_premium: 1 },

    // PPF - GLOSS (TPU)
    { name: 'PPF - 5 Years (TPU - Thermoplastic Polyurethane)', suv: 130000, duration: 960, is_premium: 1 },
    { name: 'PPF - 7 Years (TPU - Thermoplastic Polyurethane)', suv: 150000, duration: 960, is_premium: 1 },

    // PPF - MATT
    { name: 'PPF MATT - 3 Years (TPH - Thermoplastic Hybrid)', suv: 80000, duration: 720, is_premium: 1 },
    { name: 'PPF MATT - 5 Years (TPU - Thermoplastic Polyurethane)', suv: 150000, duration: 960, is_premium: 1 },
    { name: 'PPF MATT - 7 Years (TPU - Thermoplastic Polyurethane)', suv: 180000, duration: 960, is_premium: 1 },

    // PPF - BLACK
    { name: 'PPF BLACK - 3 Years (TPH - Thermoplastic Hybrid)', suv: 80000, duration: 720, is_premium: 1 },
    { name: 'PPF BLACK - 5 Years (TPH - Thermoplastic Hybrid)', suv: 150000, duration: 960, is_premium: 1 },
    { name: 'PPF BLACK - 7 Years (TPU - Thermoplastic Polyurethane)', suv: 180000, duration: 960, is_premium: 1 },

    // PPF - COLOR
    { name: 'PPF COLOR - 3 Years (TPH - Thermoplastic Hybrid)', suv: 150000, duration: 960, is_premium: 1 },

    // SPECIAL WASHING OFFER RATES
    { name: '12 Wash For 12 Months', suv: 4200, duration: 45 },
    { name: '24 Wash For 24 Months', suv: 8400, duration: 45 },
    { name: '36 Wash For 36 Months', suv: 12500, duration: 45 },
    { name: '60 Wash For 60 Months', suv: 21000, duration: 45 },

    // ANTI RUST
    { name: 'O3 Undershield (2 years)', suv: 3500, duration: 90 },
  ];

  const serviceIdMap = {};

  for (const s of servicesData) {
    const p = calcPrices(s.suv);
    const desc = `${s.name} at O3 Car Spaa Detailing Studio. Premium detailing service with high-grade automotive care.`;
    const [res] = await conn.query(`
      INSERT INTO services (
        name, description, price_hatchback, price_medium_hatchback, price_sedan, price_premium_sedan, price_suv,
        duration_minutes, is_active, is_premium
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `, [s.name, desc, p.hb, p.medHb, p.sedan, p.premSedan, p.suv, s.duration, s.is_premium || 0]);

    serviceIdMap[s.name] = res.insertId;
  }

  console.log(`✓ Inserted EXACT ${servicesData.length} official O3 services into database.`);

  // ─── EXACT 4 PACKAGES FROM IMAGE 2 ─────────────────────────────────────────
  const packagesData = [
    {
      name: 'GLASS LEATHER AMC',
      description: 'Glass & Leather Protection Annual Plan featuring Exterior Wash, Intensive Shiny Interior, Ozone Odour Treatment, Windshield Coating, Maintenance Coating & Leather Care.',
      price_hatchback: 8000,
      price_medium_hatchback: 9500,
      price_sedan: 11000,
      price_premium_sedan: 12500,
      price_suv: 14000,
      wash_count: 6,
      wax_count: 2,
      services: [
        'Exterior Wash + Shampoo & Vacuum',
        'Intensive Shiny Interior',
        'Ozone Treatment & Odour Removal',
        'Windshield Coating',
        'Maintenance Coating - 1 Time',
        'Leather Care Treatment'
      ]
    },
    {
      name: 'CERAMIC LEATHER AMC',
      description: 'Featured Ceramic Annual Protection Plan including Exterior Wash, Shiny Interior, Ozone Odour Treatment, 1 Year Ceramic Shield, Ceramic Maintenance & Leather Care.',
      price_hatchback: 14000,
      price_medium_hatchback: 16500,
      price_sedan: 19000,
      price_premium_sedan: 21500,
      price_suv: 24000,
      wash_count: 8,
      wax_count: 3,
      services: [
        'Exterior Wash + Shampoo & Vacuum',
        'Intensive Shiny Interior',
        'Ozone Treatment & Odour Removal',
        '1 Year - Ceramic Shield',
        'Ceramic Maintenance - 1 Time',
        'Leather Care Treatment'
      ]
    },
    {
      name: 'ACRYLIC LEATHER AMC',
      description: 'Acrylic Polish & Leather Protection Plan including Exterior Wash, Shiny Interior, Ozone Treatment, O3 Coating 3-Steps, Machine Polish & Leather Care.',
      price_hatchback: 6500,
      price_medium_hatchback: 7500,
      price_sedan: 8500,
      price_premium_sedan: 9500,
      price_suv: 10500,
      wash_count: 4,
      wax_count: 2,
      services: [
        'Exterior Wash + Shampoo & Vacuum',
        'Intensive Shiny Interior',
        'Ozone Treatment & Odour Removal',
        'O3 Coating (3 Steps)',
        'Machine Polish & Wax',
        'Leather Care Treatment'
      ]
    },
    {
      name: '3M AMC',
      description: '3M Annual Detailing Plan including Exterior Wash, Intensive Shiny Interior, Compounding Hi-tech Wax, Machine Polish & Wax, and Ozone Odour Removal.',
      price_hatchback: 5500,
      price_medium_hatchback: 6500,
      price_sedan: 7500,
      price_premium_sedan: 8500,
      price_suv: 9500,
      wash_count: 4,
      wax_count: 2,
      services: [
        'Exterior Wash + Shampoo & Vacuum',
        'Intensive Shiny Interior',
        'Compounding Hi-tech Wax (2 Steps)',
        'Machine Polish & Wax',
        'Ozone Treatment & Odour Removal'
      ]
    }
  ];

  for (let i = 0; i < packagesData.length; i++) {
    const p = packagesData[i];
    const [res] = await conn.query(`
      INSERT INTO packages (
        name, description, price_hatchback, price_medium_hatchback, price_sedan, price_premium_sedan, price_suv,
        wash_count, wax_count, is_published, is_active, visible_to_customer, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, ?)
    `, [
      p.name, p.description, p.price_hatchback, p.price_medium_hatchback, p.price_sedan, p.price_premium_sedan, p.price_suv,
      p.wash_count, p.wax_count, i + 1
    ]);

    const pkgId = res.insertId;

    for (const svcName of p.services) {
      const sId = serviceIdMap[svcName];
      if (sId) {
        await conn.query(`
          INSERT INTO package_services (package_id, service_id, total_count, complimentary)
          VALUES (?, ?, 1, 0)
        `, [pkgId, sId]);
      }
    }
  }

  console.log(`✓ Inserted ${packagesData.length} official O3 packages into database and linked services.`);

  await conn.end();
  console.log('\n✅ Database seeded with EXACT O3 catalog.');
}

seedO3Catalog().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
