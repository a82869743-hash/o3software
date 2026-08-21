-- Add quick wash columns to bookings table
ALTER TABLE bookings
  ADD COLUMN job_type ENUM('booking', 'quick_wash') NOT NULL DEFAULT 'booking' AFTER created_at,
  ADD COLUMN wash_status ENUM('pending', 'washing', 'completed', 'delivered') DEFAULT NULL AFTER job_type,
  ADD COLUMN queue_position INT UNSIGNED DEFAULT NULL AFTER wash_status;

-- Add index for quick wash queries
CREATE INDEX idx_bookings_job_type ON bookings (job_type);
CREATE INDEX idx_bookings_wash_status ON bookings (wash_status);

-- Add latitude/longitude to deliveries for live tracking
ALTER TABLE deliveries
  ADD COLUMN last_lat DECIMAL(10,8) DEFAULT NULL AFTER delivered_at,
  ADD COLUMN last_lng DECIMAL(11,8) DEFAULT NULL AFTER last_lat,
  ADD COLUMN location_updated_at TIMESTAMP NULL DEFAULT NULL AFTER last_lng,
  ADD COLUMN address_from VARCHAR(255) DEFAULT NULL AFTER location_updated_at,
  ADD COLUMN address_to VARCHAR(255) DEFAULT NULL AFTER address_from,
  ADD COLUMN notes TEXT DEFAULT NULL AFTER address_to;

-- Add premium_wash as a service category if not exists
INSERT IGNORE INTO service_categories (name, description, is_active)
VALUES ('Premium Wash', 'Premium exterior and interior wash with wax coating and fragrance', 1);

-- Insert premium wash service if not exists
INSERT INTO services (name, description, category_id, price_hatchback, price_medium_hatchback, price_sedan, price_premium_sedan, price_suv, duration_minutes, is_active)
SELECT 'Premium Wash', 'Complete premium wash — exterior foam wash, interior vacuum, dashboard polish, tyre dressing, air freshener, and wax coating', sc.id, 599, 699, 799, 899, 1099, 90, 1
FROM service_categories sc
WHERE sc.name = 'Premium Wash'
AND NOT EXISTS (SELECT 1 FROM services WHERE name = 'Premium Wash');

-- Ensure loyalty_transactions has all needed columns
-- (table already exists per SHOW TABLES check)

-- Ensure settings table has loyalty keys
INSERT IGNORE INTO settings (key_name, value) VALUES ('loyalty_points_ratio', '100');
INSERT IGNORE INTO settings (key_name, value) VALUES ('loyalty_min_redeem', '50');
INSERT IGNORE INTO settings (key_name, value) VALUES ('loyalty_point_value', '1');
INSERT IGNORE INTO settings (key_name, value) VALUES ('loyalty_enabled', '1');
