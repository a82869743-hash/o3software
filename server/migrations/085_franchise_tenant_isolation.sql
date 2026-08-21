-- ═══════════════════════════════════════════════════════════
-- MIGRATION 085: Multi-Tenant Franchise Database Isolation
-- Adds franchise_id column to core operational tables
-- ═══════════════════════════════════════════════════════════

ALTER TABLE users ADD COLUMN franchise_id INT UNSIGNED NULL DEFAULT 1 AFTER role;
ALTER TABLE job_carts ADD COLUMN franchise_id INT UNSIGNED NULL DEFAULT 1;
ALTER TABLE inventory ADD COLUMN franchise_id INT UNSIGNED NULL DEFAULT 1;
ALTER TABLE bookings ADD COLUMN franchise_id INT UNSIGNED NULL DEFAULT 1;
ALTER TABLE manual_bills ADD COLUMN franchise_id INT UNSIGNED NULL DEFAULT 1;
ALTER TABLE staff_attendance ADD COLUMN franchise_id INT UNSIGNED NULL DEFAULT 1;
ALTER TABLE user_packages ADD COLUMN franchise_id INT UNSIGNED NULL DEFAULT 1;
ALTER TABLE inquiries ADD COLUMN franchise_id INT UNSIGNED NULL DEFAULT 1;

-- Add indexes for fast franchise-scoped queries
ALTER TABLE users ADD INDEX idx_users_franchise (franchise_id);
ALTER TABLE job_carts ADD INDEX idx_job_carts_franchise (franchise_id);
ALTER TABLE inventory ADD INDEX idx_inventory_franchise (franchise_id);
ALTER TABLE bookings ADD INDEX idx_bookings_franchise (franchise_id);
ALTER TABLE manual_bills ADD INDEX idx_mbills_franchise (franchise_id);
ALTER TABLE staff_attendance ADD INDEX idx_attendance_franchise (franchise_id);
ALTER TABLE user_packages ADD INDEX idx_user_packages_franchise (franchise_id);
ALTER TABLE inquiries ADD INDEX idx_inquiries_franchise (franchise_id);
