-- Fix settings inserts (correct column names: key_name, value)
INSERT IGNORE INTO settings (key_name, value) VALUES ('loyalty_points_ratio', '100');
INSERT IGNORE INTO settings (key_name, value) VALUES ('loyalty_min_redeem', '50');
INSERT IGNORE INTO settings (key_name, value) VALUES ('loyalty_point_value', '1');
INSERT IGNORE INTO settings (key_name, value) VALUES ('loyalty_enabled', '1');

-- Insert premium wash service (mark as premium)
INSERT INTO services (name, description, category_id, price_hatchback, price_medium_hatchback, price_sedan, price_premium_sedan, price_suv, duration_minutes, is_active, is_premium)
SELECT 'Premium Wash', 'Complete premium wash — exterior foam wash, interior vacuum, dashboard polish, tyre dressing, air freshener, and wax coating',
  sc.id, 599, 699, 799, 899, 1099, 90, 1, 1
FROM service_categories sc
WHERE sc.name = 'Premium Wash'
AND NOT EXISTS (SELECT 1 FROM services WHERE name = 'Premium Wash');
