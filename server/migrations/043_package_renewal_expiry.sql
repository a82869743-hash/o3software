-- ═══════════════════════════════════════════════════════════
-- PHASE 2: Package Renewal & Expiry System
-- Adds renewal tracking, payment status, package status
-- to user_packages. Safe ALTER — all columns are nullable
-- or have defaults.
-- ═══════════════════════════════════════════════════════════

-- Add expiry and renewal fields to user_packages
ALTER TABLE user_packages
  ADD COLUMN renewed_from_id INT UNSIGNED NULL DEFAULT NULL
    COMMENT 'Points to the original user_package id this was renewed from',
  ADD COLUMN payment_status ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'paid'
    COMMENT 'Payment status for this package purchase',
  ADD COLUMN package_status ENUM('active','expired','cancelled','renewed') NOT NULL DEFAULT 'active'
    COMMENT 'Current lifecycle status of the package',
  ADD COLUMN price_paid DECIMAL(10,2) NULL DEFAULT NULL
    COMMENT 'Actual price paid for this package',
  ADD COLUMN vehicle_segment VARCHAR(50) NULL DEFAULT NULL
    COMMENT 'Vehicle segment used for pricing: hatchback, sedan, suv, luxury',
  ADD COLUMN vehicle_id INT UNSIGNED NULL DEFAULT NULL
    COMMENT 'Vehicle this package is associated with',
  ADD COLUMN renewed_at TIMESTAMP NULL DEFAULT NULL
    COMMENT 'When this package was renewed (new package created)',
  ADD COLUMN cancelled_at TIMESTAMP NULL DEFAULT NULL;

-- Index for renewal chain lookups
ALTER TABLE user_packages
  ADD INDEX idx_renewed_from (renewed_from_id),
  ADD INDEX idx_package_status (package_status),
  ADD INDEX idx_payment_status (payment_status);

-- Update existing rows: mark active if end_date > NOW or end_date IS NULL
UPDATE user_packages
  SET package_status = 'active'
  WHERE (end_date IS NULL OR end_date > NOW())
    AND package_status = 'active';

-- Mark expired ones
UPDATE user_packages
  SET package_status = 'expired'
  WHERE end_date IS NOT NULL AND end_date <= NOW()
    AND package_status = 'active';
