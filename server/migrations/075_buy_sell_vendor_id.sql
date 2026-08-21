-- Migration 075: Add vendor_id to buy_sell table
ALTER TABLE buy_sell ADD COLUMN vendor_id INT DEFAULT NULL AFTER party_mobile;
