-- ═══════════════════════════════════════════════════════════
-- PHASE 2: Package Vehicle Pricing
-- Flexible pricing for additional vehicle segments.
-- The packages table already has hatchback/sedan/suv columns,
-- this extends to support luxury + custom segments.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS package_vehicle_pricing (
  id              INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  package_id      INT UNSIGNED  NOT NULL,
  vehicle_segment VARCHAR(50)   NOT NULL
    COMMENT 'hatchback, medium_hatchback, sedan, premium_sedan, suv, luxury',
  price           DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  UNIQUE KEY uq_pkg_segment (package_id, vehicle_segment),
  INDEX idx_package_id (package_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add luxury pricing to packages table
ALTER TABLE packages
  ADD COLUMN price_luxury DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER price_suv;

-- Add luxury pricing to services table
ALTER TABLE services
  ADD COLUMN price_luxury DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER price_suv;
