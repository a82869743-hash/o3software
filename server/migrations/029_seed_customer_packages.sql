-- ═══════════════════════════════════════════════════════════
-- TASK 8: Seed Package Data
-- Inserts Bronze/Silver/Gold/Diamond/Platinum packages
-- Uses INSERT IGNORE to avoid duplicates if packages already exist
-- ═══════════════════════════════════════════════════════════

-- Step 1: Insert packages (skip if name already exists)
INSERT IGNORE INTO packages (name, description, wash_count, wax_count, is_published)
VALUES
  ('Bronze',   'Basic care — 1 Foam Wash + 1 Wax Coat',     1, 1, 1),
  ('Silver',   'Standard care — 2 Foam Washes + 2 Wax Coats', 2, 2, 1),
  ('Gold',     'Premium care — 4 Foam Washes + 3 Wax Coats',  4, 3, 1),
  ('Diamond',  'Elite care — 6 Foam Washes + 2 Wax Coats + 2 Two Wheeler Washes', 6, 2, 1),
  ('Platinum', 'Ultimate care — 8 Foam Washes + 3 Wax Coats + 1 Deep Cleaning',   8, 3, 1);

-- ═══════════════════════════════════════════════════════════
-- TASK 9: Test Queries
-- Copy and run these manually to verify the system works.
-- ═══════════════════════════════════════════════════════════

-- Test 1: Assign Bronze package to user_id=1
-- INSERT INTO user_packages (user_id, package_id) VALUES (1, (SELECT id FROM packages WHERE name = 'Bronze' LIMIT 1));

-- Test 2: Create usage rows for that package
-- SET @up_id = LAST_INSERT_ID();
-- INSERT INTO package_usage (user_package_id, service_name, used_count) VALUES (@up_id, 'Foam Wash', 0);
-- INSERT INTO package_usage (user_package_id, service_name, used_count) VALUES (@up_id, 'Wax Coat', 0);

-- Test 3: Simulate using Foam Wash once
-- UPDATE package_usage SET used_count = used_count + 1 WHERE user_package_id = @up_id AND service_name = 'Foam Wash';

-- Test 4: Verify usage reduction
-- SELECT service_name, used_count FROM package_usage WHERE user_package_id = @up_id;

-- Test 5: Full dashboard query (see Task 7 in controller)
-- SELECT v.brand, v.model, p.name AS package_name, pu.service_name, pu.used_count
-- FROM vehicles v
-- JOIN user_packages up ON up.user_id = v.customer_id
-- JOIN packages p ON p.id = up.package_id
-- LEFT JOIN package_usage pu ON pu.user_package_id = up.id
-- WHERE v.customer_id = 1 AND v.is_primary = 1
-- AND (up.end_date IS NULL OR up.end_date > NOW());
