-- ════════════════════════════════════════════════════════════════
-- Migration 041: Package Approvals, CRM History, and Package Matrix
-- ════════════════════════════════════════════════════════════════

-- 1. Create CRM Notes table
CREATE TABLE IF NOT EXISTS customer_notes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_customer_id (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Create Package Requests table
CREATE TABLE IF NOT EXISTS package_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NOT NULL,
  vehicle_id INT UNSIGNED NOT NULL,
  package_id INT UNSIGNED NOT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  INDEX idx_customer_id (customer_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Seed the exact pricing matrix packages
-- Note: 'sedan' matches SEDAN/SUV, 'premium_sedan' matches PREMIUM SEDAN, 'suv' matches LARGE CAR.
-- PREMIUM SEDAN and LARGE CAR share the exact same pricing in the user's matrix.

INSERT INTO packages (name, description, price_hatchback, price_medium_hatchback, price_sedan, price_premium_sedan, price_suv, wash_count, is_published, visible_to_customer)
VALUES
  -- Bronze Package (3 Washes)
  ('Bronze Package - Basic Wash', 'Basic Wash x3', 1200, 1350, 1500, 1800, 1800, 3, 1, 1),
  ('Bronze Package - Premium Clean', 'Premium Clean x3', 1650, 1800, 1950, 2250, 2250, 3, 1, 1),

  -- Silver Package (5 Washes)
  ('Silver Package - Basic Wash', 'Basic Wash x5', 2000, 2250, 2500, 3000, 3000, 5, 1, 1),
  ('Silver Package - Premium Clean', 'Premium Clean x5', 2750, 3000, 3250, 3750, 3750, 5, 1, 1),

  -- Gold Package (8 Washes)
  ('Gold Package - Basic Wash', 'Basic Wash x8', 3200, 3600, 4000, 4800, 4800, 8, 1, 1),
  ('Gold Package - Premium Clean', 'Premium Clean x8', 4400, 4800, 5200, 6000, 6000, 8, 1, 1),

  -- Diamond Package (10 Washes)
  ('Diamond Package - Basic Wash', 'Basic Wash x10', 4000, 4500, 5000, 6000, 6000, 10, 1, 1),
  ('Diamond Package - Premium Clean', 'Premium Clean x10', 5500, 6000, 6500, 7500, 7500, 10, 1, 1),

  -- Platinum Package (12 Washes)
  ('Platinum Package - Basic Wash', 'Basic Wash x12', 4800, 5400, 6000, 7200, 7200, 12, 1, 1),
  ('Platinum Package - Premium Clean', 'Premium Clean x12', 6600, 7200, 7800, 9000, 9000, 12, 1, 1)

ON DUPLICATE KEY UPDATE
  price_hatchback = VALUES(price_hatchback),
  price_medium_hatchback = VALUES(price_medium_hatchback),
  price_sedan = VALUES(price_sedan),
  price_premium_sedan = VALUES(price_premium_sedan),
  price_suv = VALUES(price_suv),
  wash_count = VALUES(wash_count),
  is_published = 1,
  visible_to_customer = 1;
