-- Migration 084: Add rich service catalog details and cart JSON columns

-- 1. Add rich service details to services table
ALTER TABLE services ADD COLUMN features_json TEXT NULL;
ALTER TABLE services ADD COLUMN whats_included_json TEXT NULL;
ALTER TABLE services ADD COLUMN process_json TEXT NULL;
ALTER TABLE services ADD COLUMN image_url VARCHAR(500) NULL;

-- 2. Add cart_items_json to bookings table
ALTER TABLE bookings ADD COLUMN cart_items_json TEXT NULL;

-- 3. Add items_json and shipping_address to product_orders table
ALTER TABLE product_orders ADD COLUMN items_json TEXT NULL;
ALTER TABLE product_orders ADD COLUMN shipping_address TEXT NULL;
