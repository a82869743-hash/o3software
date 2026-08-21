ALTER TABLE vehicles ADD COLUMN manufacture_year SMALLINT UNSIGNED DEFAULT NULL;
UPDATE vehicles SET manufacture_year = car_year;

ALTER TABLE manual_bills ADD COLUMN vehicle_brand VARCHAR(80) NULL;
ALTER TABLE manual_bills ADD COLUMN vehicle_model VARCHAR(80) NULL;
ALTER TABLE manual_bills ADD COLUMN vehicle_reg_no VARCHAR(20) NULL;

ALTER TABLE packages ADD COLUMN is_custom TINYINT(1) DEFAULT 0;

ALTER TABLE user_packages ADD COLUMN vehicle_id INT UNSIGNED DEFAULT NULL;
ALTER TABLE user_packages ADD CONSTRAINT fk_user_packages_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL;

ALTER TABLE v2_inventory_items ADD COLUMN item_type ENUM('consumable', 'accessory') DEFAULT 'consumable';
