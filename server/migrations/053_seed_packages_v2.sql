-- ═══════════════════════════════════════════════════════════
-- MIGRATION 051: Seed AutoHerb Annual Car Care Packages
-- ═══════════════════════════════════════════════════════════

-- Deactivate all old packages
UPDATE packages SET is_active = 0, is_published = 0, visible_to_customer = 0 WHERE 1=1;

-- ─── INSERT 5 PACKAGES ──────────────────────────
INSERT INTO packages (name, description, paid_wash_count, wash_count, wax_count, is_published, is_active, visible_to_customer, sort_order)
VALUES
  ('Bronze Package', 'Pay For 3 Car Foam Wash', 3, 0, 0, 1, 1, 1, 1),
  ('Silver Package', 'Pay For 5 Car Foam Wash', 5, 0, 0, 1, 1, 1, 2),
  ('Gold Package', 'Pay For 8 Car Foam Wash', 8, 0, 0, 1, 1, 1, 3),
  ('Diamond Package', 'Pay For 10 Car Foam Wash', 10, 0, 0, 1, 1, 1, 4),
  ('Platinum Package', 'Pay For 12 Car Foam Wash', 12, 0, 0, 1, 1, 1, 5);

-- Get package IDs (fallback to name only if active check fails)
SET @bronze_id = (SELECT id FROM packages WHERE name = 'Bronze Package' ORDER BY id DESC LIMIT 1);
SET @silver_id = (SELECT id FROM packages WHERE name = 'Silver Package' ORDER BY id DESC LIMIT 1);
SET @gold_id = (SELECT id FROM packages WHERE name = 'Gold Package' ORDER BY id DESC LIMIT 1);
SET @diamond_id = (SELECT id FROM packages WHERE name = 'Diamond Package' ORDER BY id DESC LIMIT 1);
SET @platinum_id = (SELECT id FROM packages WHERE name = 'Platinum Package' ORDER BY id DESC LIMIT 1);

UPDATE packages SET is_active = 1, is_published = 1, visible_to_customer = 1, paid_wash_count = 3, sort_order = 1 WHERE id = @bronze_id;
UPDATE packages SET is_active = 1, is_published = 1, visible_to_customer = 1, paid_wash_count = 5, sort_order = 2 WHERE id = @silver_id;
UPDATE packages SET is_active = 1, is_published = 1, visible_to_customer = 1, paid_wash_count = 8, sort_order = 3 WHERE id = @gold_id;
UPDATE packages SET is_active = 1, is_published = 1, visible_to_customer = 1, paid_wash_count = 10, sort_order = 4 WHERE id = @diamond_id;
UPDATE packages SET is_active = 1, is_published = 1, visible_to_customer = 1, paid_wash_count = 12, sort_order = 5 WHERE id = @platinum_id;

-- ─── PACKAGE PRICING ────────────────────────────

-- BRONZE Pricing
INSERT INTO package_pricing (package_id, car_type, pricing_type, price) VALUES
  (@bronze_id, 'SMALL_HATCHBACK', 'basic', 1200), (@bronze_id, 'SMALL_HATCHBACK', 'premium', 1650),
  (@bronze_id, 'MEDIUM_HATCHBACK', 'basic', 1350), (@bronze_id, 'MEDIUM_HATCHBACK', 'premium', 1800),
  (@bronze_id, 'SEDAN_SUV', 'basic', 1500), (@bronze_id, 'SEDAN_SUV', 'premium', 1950),
  (@bronze_id, 'PREMIUM_SEDAN', 'basic', 1800), (@bronze_id, 'PREMIUM_SEDAN', 'premium', 2250),
  (@bronze_id, 'LARGE_CAR', 'basic', 1800), (@bronze_id, 'LARGE_CAR', 'premium', 2250);

-- SILVER Pricing
INSERT INTO package_pricing (package_id, car_type, pricing_type, price) VALUES
  (@silver_id, 'SMALL_HATCHBACK', 'basic', 2000), (@silver_id, 'SMALL_HATCHBACK', 'premium', 2750),
  (@silver_id, 'MEDIUM_HATCHBACK', 'basic', 2250), (@silver_id, 'MEDIUM_HATCHBACK', 'premium', 3000),
  (@silver_id, 'SEDAN_SUV', 'basic', 2500), (@silver_id, 'SEDAN_SUV', 'premium', 3250),
  (@silver_id, 'PREMIUM_SEDAN', 'basic', 3000), (@silver_id, 'PREMIUM_SEDAN', 'premium', 3750),
  (@silver_id, 'LARGE_CAR', 'basic', 3000), (@silver_id, 'LARGE_CAR', 'premium', 3750);

-- GOLD Pricing
INSERT INTO package_pricing (package_id, car_type, pricing_type, price) VALUES
  (@gold_id, 'SMALL_HATCHBACK', 'basic', 3200), (@gold_id, 'SMALL_HATCHBACK', 'premium', 4400),
  (@gold_id, 'MEDIUM_HATCHBACK', 'basic', 3600), (@gold_id, 'MEDIUM_HATCHBACK', 'premium', 4800),
  (@gold_id, 'SEDAN_SUV', 'basic', 4000), (@gold_id, 'SEDAN_SUV', 'premium', 5200),
  (@gold_id, 'PREMIUM_SEDAN', 'basic', 4800), (@gold_id, 'PREMIUM_SEDAN', 'premium', 6000),
  (@gold_id, 'LARGE_CAR', 'basic', 4800), (@gold_id, 'LARGE_CAR', 'premium', 6000);

-- DIAMOND Pricing
INSERT INTO package_pricing (package_id, car_type, pricing_type, price) VALUES
  (@diamond_id, 'SMALL_HATCHBACK', 'basic', 4000), (@diamond_id, 'SMALL_HATCHBACK', 'premium', 5500),
  (@diamond_id, 'MEDIUM_HATCHBACK', 'basic', 4500), (@diamond_id, 'MEDIUM_HATCHBACK', 'premium', 6000),
  (@diamond_id, 'SEDAN_SUV', 'basic', 5000), (@diamond_id, 'SEDAN_SUV', 'premium', 6500),
  (@diamond_id, 'PREMIUM_SEDAN', 'basic', 6000), (@diamond_id, 'PREMIUM_SEDAN', 'premium', 7500),
  (@diamond_id, 'LARGE_CAR', 'basic', 6000), (@diamond_id, 'LARGE_CAR', 'premium', 7500);

-- PLATINUM Pricing
INSERT INTO package_pricing (package_id, car_type, pricing_type, price) VALUES
  (@platinum_id, 'SMALL_HATCHBACK', 'basic', 4800), (@platinum_id, 'SMALL_HATCHBACK', 'premium', 6600),
  (@platinum_id, 'MEDIUM_HATCHBACK', 'basic', 5400), (@platinum_id, 'MEDIUM_HATCHBACK', 'premium', 7200),
  (@platinum_id, 'SEDAN_SUV', 'basic', 6000), (@platinum_id, 'SEDAN_SUV', 'premium', 7800),
  (@platinum_id, 'PREMIUM_SEDAN', 'basic', 7200), (@platinum_id, 'PREMIUM_SEDAN', 'premium', 9000),
  (@platinum_id, 'LARGE_CAR', 'basic', 7200), (@platinum_id, 'LARGE_CAR', 'premium', 9000);

-- ─── PACKAGE SERVICES (Complimentary) ────────────
-- First, ensure services exist — look up by name or create stubs
-- We'll use service names directly in package_services via total_count

-- Helper: Get or note service IDs 
-- (These service names must match what's in the `services` table)
SET @svc_foam_wash = (SELECT id FROM services WHERE name LIKE '%Foam Wash%' AND is_active = 1 ORDER BY id LIMIT 1);
SET @svc_wax_coat = (SELECT id FROM services WHERE name LIKE '%Wax Coat%' AND name NOT LIKE '%Ceramic%' AND name NOT LIKE '%Two Wheeler%' AND is_active = 1 ORDER BY id LIMIT 1);
SET @svc_tw_wash = (SELECT id FROM services WHERE name LIKE '%Two Wheeler Wash%' AND is_active = 1 ORDER BY id LIMIT 1);
SET @svc_tw_wax = (SELECT id FROM services WHERE name LIKE '%Two Wheeler Wax%' AND is_active = 1 ORDER BY id LIMIT 1);
SET @svc_ceramic = (SELECT id FROM services WHERE name LIKE '%Ceramic%' AND is_active = 1 ORDER BY id LIMIT 1);
SET @svc_deep_clean = (SELECT id FROM services WHERE name LIKE '%Deep Clean%' AND is_active = 1 ORDER BY id LIMIT 1);

-- Clean existing package_services for these new packages
DELETE FROM package_services WHERE package_id IN (@bronze_id, @silver_id, @gold_id, @diamond_id, @platinum_id);

-- BRONZE: 4 Car Foam Wash (3 paid + 1 comp), 1 Body Wax Coat
INSERT INTO package_services (package_id, service_id, total_count) VALUES
  (@bronze_id, @svc_foam_wash, 4),
  (@bronze_id, @svc_wax_coat, 1);

-- SILVER: 7 Car Foam Wash (5 paid + 2 comp), 2 Body Wax Coat, 1 Two Wheeler Wash
INSERT INTO package_services (package_id, service_id, total_count) VALUES
  (@silver_id, @svc_foam_wash, 7),
  (@silver_id, @svc_wax_coat, 2),
  (@silver_id, @svc_tw_wash, 1);

-- GOLD: 12 Car Foam Wash (8 paid + 4 comp), 3 Body Wax Coat, 1 Two Wheeler Wash, 1 Two Wheeler Wax Coat
INSERT INTO package_services (package_id, service_id, total_count) VALUES
  (@gold_id, @svc_foam_wash, 12),
  (@gold_id, @svc_wax_coat, 3),
  (@gold_id, @svc_tw_wash, 1),
  (@gold_id, @svc_tw_wax, 1);

-- DIAMOND: 16 Car Foam Wash (10 paid + 6 comp), 2 Body Wax Coat, 2 Two Wheeler Wash, 1 Two Wheeler Wax Coat, 1 Ceramic
INSERT INTO package_services (package_id, service_id, total_count) VALUES
  (@diamond_id, @svc_foam_wash, 16),
  (@diamond_id, @svc_wax_coat, 2),
  (@diamond_id, @svc_tw_wash, 2),
  (@diamond_id, @svc_tw_wax, 1),
  (@diamond_id, @svc_ceramic, 1);

-- PLATINUM: 20 Car Foam Wash (12 paid + 8 comp), 3 Body Wax Coat, 2 Two Wheeler Wash, 1 Two Wheeler Wax Coat, 1 Ceramic, 1 Deep Cleaning
INSERT INTO package_services (package_id, service_id, total_count) VALUES
  (@platinum_id, @svc_foam_wash, 20),
  (@platinum_id, @svc_wax_coat, 3),
  (@platinum_id, @svc_tw_wash, 2),
  (@platinum_id, @svc_tw_wax, 1),
  (@platinum_id, @svc_ceramic, 1),
  (@platinum_id, @svc_deep_clean, 1);
