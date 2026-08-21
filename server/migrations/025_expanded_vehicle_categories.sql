-- ════════════════════════════════════════════════════════════════
-- Migration 025: Expand Vehicle Categories from 3 to 5 Segments
-- ════════════════════════════════════════════════════════════════
-- New columns: price_medium_hatchback, price_premium_sedan
-- Final order: hatchback → medium_hatchback → sedan → premium_sedan → suv

-- ─── Step 1: ALTER services TABLE ────────────────────────────
ALTER TABLE services
  ADD COLUMN price_medium_hatchback DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER price_hatchback,
  ADD COLUMN price_premium_sedan    DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER price_sedan;

-- ─── Step 2: ALTER packages TABLE ────────────────────────────
ALTER TABLE packages
  ADD COLUMN price_medium_hatchback DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER price_hatchback,
  ADD COLUMN price_premium_sedan    DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER price_sedan;

-- ─── Step 3: ALTER bookings TABLE ────────────────────────────
ALTER TABLE bookings
  ADD COLUMN vehicle_category ENUM('hatchback','medium_hatchback','sedan','premium_sedan','suv') NULL AFTER vehicle_reg_no;

-- ─── Step 3b: Add UNIQUE index on name for idempotent seeding ──
ALTER TABLE services ADD UNIQUE INDEX idx_services_name (name);
ALTER TABLE packages ADD UNIQUE INDEX idx_packages_name (name);

-- ─── Step 4: SEED services (UPSERT by name) ─────────────────

INSERT INTO services (name, description, price_hatchback, price_medium_hatchback, price_sedan, price_premium_sedan, price_suv, is_active)
VALUES
  ('Exterior Body Wash',         'Complete exterior wash with hand-dry and wipe-down',                     200, 250, 300, 400, 500, 1),
  ('Interior Cleaning',          'Full interior vacuum, dashboard wipe, and freshener',                    300, 350, 400, 500, 600, 1),
  ('Full Body Wash',             'Combined interior + exterior cleaning',                                  450, 550, 650, 800, 1000, 1),
  ('Engine Bay Cleaning',        'Detailed engine compartment degreasing and dressing',                    500, 600, 700, 900, 1200, 1),
  ('Foam Wash',                  'High-pressure foam rinse with pH-neutral shampoo',                       300, 350, 400, 500, 600, 1),
  ('Rubbing / Compounding',      'Paint correction to remove swirl marks and light scratches',             1500, 2000, 2500, 3500, 5000, 1),
  ('Teflon Coating',             '3-month paint protection with teflon sealant',                           2000, 2500, 3000, 4000, 5500, 1),
  ('Ceramic Coating',            'Long-lasting 9H ceramic nano-coating for ultimate paint protection',     8000, 10000, 12000, 16000, 22000, 1),
  ('PPF (Paint Protection Film)','Transparent self-healing film to protect paint from chips and scratches', 15000, 20000, 25000, 35000, 50000, 1),
  ('Underbody Anti-Rust Coating','Protective anti-corrosion spray for the underbody',                      1500, 2000, 2500, 3500, 5000, 1),
  ('AC Vent Cleaning',           'Antimicrobial deep clean of all AC vents and blower',                    500, 600, 700, 800, 1000, 1),
  ('Seat Shampooing',            'Deep extraction shampoo of all fabric / leather seats',                  800, 1000, 1200, 1600, 2000, 1),
  ('Dashboard / Trim Polish',    'UV-protectant polish and dressing for interior trims',                   400, 500, 600, 800, 1000, 1),
  ('Windshield Treatment',       'Hydrophobic rain-repellent treatment for the windshield',                500, 500, 600, 700, 800, 1),
  ('Headlight Restoration',      'Sand, polish, and UV-coat to restore clarity',                           600, 700, 800, 1000, 1200, 1),
  ('Tyre Dressing / Alloy Clean','Deep clean alloy wheels and apply tyre dressing',                        300, 400, 500, 600, 800, 1)
ON DUPLICATE KEY UPDATE
  description           = VALUES(description),
  price_hatchback       = VALUES(price_hatchback),
  price_medium_hatchback= VALUES(price_medium_hatchback),
  price_sedan           = VALUES(price_sedan),
  price_premium_sedan   = VALUES(price_premium_sedan),
  price_suv             = VALUES(price_suv);

-- ─── Step 5: SEED packages ──────────────────────────────────
INSERT INTO packages (name, description, price_hatchback, price_medium_hatchback, price_sedan, price_premium_sedan, price_suv, wash_count, wax_count, is_published)
VALUES
  ('Basic Wash Package',
   'Exterior body wash + interior vacuum + dashboard wipe. Perfect for routine maintenance.',
   400, 500, 600, 800, 1000, 2, 0, 1),

  ('Premium Detail Package',
   'Full body wash + seat shampoo + dashboard polish + tyre dressing. Comprehensive inside-out care.',
   1800, 2200, 2800, 3600, 4500, 3, 1, 1),

  ('Ultimate Protection Package',
   'Rubbing + teflon coating + underbody anti-rust + full body wash. Maximum paint protection.',
   4500, 5800, 7200, 9500, 13000, 4, 2, 1),

  ('Ceramic Shield Package',
   'Ceramic coating + PPF key panels + engine bay cleaning + headlight restoration. The flagship package.',
   22000, 28000, 35000, 48000, 65000, 6, 3, 1),

  ('Interior Refresh Package',
   'Interior cleaning + seat shampooing + AC vent cleaning + dashboard polish. Full cabin revival.',
   1800, 2200, 2700, 3500, 4200, 2, 0, 1)
ON DUPLICATE KEY UPDATE
  description           = VALUES(description),
  price_hatchback       = VALUES(price_hatchback),
  price_medium_hatchback= VALUES(price_medium_hatchback),
  price_sedan           = VALUES(price_sedan),
  price_premium_sedan   = VALUES(price_premium_sedan),
  price_suv             = VALUES(price_suv),
  wash_count            = VALUES(wash_count),
  wax_count             = VALUES(wax_count),
  is_published          = VALUES(is_published);

-- ─── Step 6: Link package → services ────────────────────────
-- Basic Wash Package → Exterior Body Wash, Interior Cleaning
INSERT IGNORE INTO package_services (package_id, service_id)
  SELECT p.id, s.id FROM packages p, services s
  WHERE p.name = 'Basic Wash Package' AND s.name IN ('Exterior Body Wash', 'Interior Cleaning');

-- Premium Detail Package → Full Body Wash, Seat Shampooing, Dashboard / Trim Polish, Tyre Dressing / Alloy Clean
INSERT IGNORE INTO package_services (package_id, service_id)
  SELECT p.id, s.id FROM packages p, services s
  WHERE p.name = 'Premium Detail Package' AND s.name IN ('Full Body Wash', 'Seat Shampooing', 'Dashboard / Trim Polish', 'Tyre Dressing / Alloy Clean');

-- Ultimate Protection Package → Rubbing / Compounding, Teflon Coating, Underbody Anti-Rust Coating, Full Body Wash
INSERT IGNORE INTO package_services (package_id, service_id)
  SELECT p.id, s.id FROM packages p, services s
  WHERE p.name = 'Ultimate Protection Package' AND s.name IN ('Rubbing / Compounding', 'Teflon Coating', 'Underbody Anti-Rust Coating', 'Full Body Wash');

-- Ceramic Shield Package → Ceramic Coating, PPF, Engine Bay Cleaning, Headlight Restoration
INSERT IGNORE INTO package_services (package_id, service_id)
  SELECT p.id, s.id FROM packages p, services s
  WHERE p.name = 'Ceramic Shield Package' AND s.name IN ('Ceramic Coating', 'PPF (Paint Protection Film)', 'Engine Bay Cleaning', 'Headlight Restoration');

-- Interior Refresh Package → Interior Cleaning, Seat Shampooing, AC Vent Cleaning, Dashboard / Trim Polish
INSERT IGNORE INTO package_services (package_id, service_id)
  SELECT p.id, s.id FROM packages p, services s
  WHERE p.name = 'Interior Refresh Package' AND s.name IN ('Interior Cleaning', 'Seat Shampooing', 'AC Vent Cleaning', 'Dashboard / Trim Polish');
