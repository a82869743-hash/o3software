-- Migration 083: Update zero-priced services and deactivate test entries
-- Fixes services appearing as 'Free' in customer dashboard and services catalog

-- 1. Deactivate test services
UPDATE services SET is_active = 0 WHERE name LIKE '%178499%';

-- 2. Update 0-priced services with realistic segment pricing
UPDATE services SET price_hatchback=150.00, price_medium_hatchback=150.00, price_sedan=150.00, price_premium_sedan=200.00, price_suv=200.00 WHERE id=22;
UPDATE services SET price_hatchback=200.00, price_medium_hatchback=200.00, price_sedan=200.00, price_premium_sedan=250.00, price_suv=250.00 WHERE id=23;
UPDATE services SET price_hatchback=1500.00, price_medium_hatchback=1800.00, price_sedan=200.00, price_premium_sedan=2500.00, price_suv=3000.00 WHERE id=25;
UPDATE services SET price_medium_hatchback=450.00, price_premium_sedan=550.00 WHERE id=26;
UPDATE services SET price_medium_hatchback=9000.00, price_premium_sedan=11000.00 WHERE id=27;
UPDATE services SET price_medium_hatchback=1800.00, price_premium_sedan=2200.00 WHERE id=29;
UPDATE services SET price_medium_hatchback=600.00, price_premium_sedan=800.00 WHERE id=30;
