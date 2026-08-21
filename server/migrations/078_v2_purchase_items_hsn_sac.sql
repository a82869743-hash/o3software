-- Migration 078: Add missing hsn_sac column to v2_purchase_items
ALTER TABLE v2_purchase_items ADD COLUMN hsn_sac VARCHAR(50) DEFAULT NULL AFTER item_id;
