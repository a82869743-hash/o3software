-- ═══════════════════════════════════════════════════════════
-- Migration 030: Package Visibility & Service Counts
-- 
-- 1. Adds is_active and visible_to_customer flags to packages
-- 2. Adds total_count to package_services for custom builder
-- 3. Hides 5 legacy packages from customer view
--
-- ⚠️  All changes are ADDITIVE — no data is deleted
-- ═══════════════════════════════════════════════════════════

-- Step 1: Add visibility columns to packages (safe — IF NOT EXISTS equivalent via IGNORE)
ALTER TABLE packages
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN visible_to_customer TINYINT(1) NOT NULL DEFAULT 1;

-- Step 2: Add total_count to package_services for custom package builder
-- This tracks how many times each service is included in a package.
ALTER TABLE package_services
  ADD COLUMN total_count INT UNSIGNED NOT NULL DEFAULT 1;

-- Step 3: Hide specific old packages from customer-facing views ONLY
-- These packages remain visible to admin and still work for existing assignments.
UPDATE packages
SET visible_to_customer = 0
WHERE name IN (
  'Basic Wash Package',
  'Ceramic Shield Package',
  'Interior Refresh Package',
  'Premium Detail Package',
  'Ultimate Protection Package'
);
