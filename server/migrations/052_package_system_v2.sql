-- ═══════════════════════════════════════════════════════════
-- MIGRATION 052: Package System V2 — Annual Car Care
-- MySQL 8.0 Compatible (no IF NOT EXISTS for columns)
-- ═══════════════════════════════════════════════════════════

-- 1. Add new columns to packages (skip is_active & visible_to_customer — they exist)
-- Use a stored procedure to safely add columns only if missing
DELIMITER //
CREATE PROCEDURE _add_col_if_missing(
  IN tbl VARCHAR(64), IN col VARCHAR(64), IN col_def VARCHAR(255)
)
BEGIN
  SET @q = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', col_def);
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col
  ) THEN
    PREPARE stmt FROM @q;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;


-- packages table — add missing columns
CALL _add_col_if_missing('packages', 'paid_wash_count', 'INT UNSIGNED NOT NULL DEFAULT 0 AFTER wax_count');
CALL _add_col_if_missing('packages', 'sort_order', 'INT NOT NULL DEFAULT 0 AFTER visible_to_customer');

-- 2. Create package_pricing table
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Add pricing_type + car_type + rejection_reason to package_requests
CALL _add_col_if_missing('package_requests', 'pricing_type', "ENUM('basic','premium') NOT NULL DEFAULT 'basic' AFTER price");
CALL _add_col_if_missing('package_requests', 'car_type', 'VARCHAR(50) NULL AFTER pricing_type');
CALL _add_col_if_missing('package_requests', 'rejection_reason', 'TEXT NULL AFTER status');

-- 4. Add pricing_type + car_type to user_packages
CALL _add_col_if_missing('user_packages', 'pricing_type', "ENUM('basic','premium') NULL DEFAULT 'basic'");
CALL _add_col_if_missing('user_packages', 'car_type', 'VARCHAR(50) NULL');

-- Cleanup
DROP PROCEDURE IF EXISTS _add_col_if_missing;
