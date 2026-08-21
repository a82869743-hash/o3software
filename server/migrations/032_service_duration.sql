-- ═══════════════════════════════════════════════════════════
-- Migration 032: Service Duration & Multi-Service Booking
--
-- 1. Adds duration_minutes to services
-- 2. Adds total_duration to bookings
-- 3. Creates booking_services junction table
--
-- ⚠️  ADDITIVE ONLY
-- ═══════════════════════════════════════════════════════════

-- Step 1: Add duration to services
ALTER TABLE services
  ADD COLUMN duration_minutes INT UNSIGNED NOT NULL DEFAULT 60;

-- Step 2: Add total duration tracking to bookings
ALTER TABLE bookings
  ADD COLUMN total_duration INT UNSIGNED NULL AFTER vehicle_reg_no;

-- Step 3: Junction table for multi-service bookings
CREATE TABLE IF NOT EXISTS booking_services (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id INT UNSIGNED NOT NULL,
  service_id INT UNSIGNED NOT NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  INDEX idx_booking_id (booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
