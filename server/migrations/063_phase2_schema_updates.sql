-- Migration 063: Schema updates for Phase 2 Operations Layer
-- 1. Ensure booking_services table exists
CREATE TABLE IF NOT EXISTS booking_services (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id INT UNSIGNED NOT NULL,
  service_id INT UNSIGNED NOT NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  INDEX idx_booking_id (booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Add estimated_completion_at to job_carts
ALTER TABLE job_carts ADD COLUMN estimated_completion_at DATETIME DEFAULT NULL;

-- 3. Add pickup_charges to v2_pickup_requests
ALTER TABLE v2_pickup_requests ADD COLUMN pickup_charges DECIMAL(10,2) DEFAULT 0.00;
