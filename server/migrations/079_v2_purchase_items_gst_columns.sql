-- Migration 079: Add missing GST columns to v2_purchase_items
ALTER TABLE v2_purchase_items ADD COLUMN hsn_sac VARCHAR(50) DEFAULT NULL AFTER item_id;
ALTER TABLE v2_purchase_items ADD COLUMN gst_rate DECIMAL(5,2) DEFAULT 0.00 AFTER unit_price;
ALTER TABLE v2_purchase_items ADD COLUMN cgst_amount DECIMAL(12,2) DEFAULT 0.00 AFTER gst_rate;
ALTER TABLE v2_purchase_items ADD COLUMN sgst_amount DECIMAL(12,2) DEFAULT 0.00 AFTER cgst_amount;
ALTER TABLE v2_purchase_items ADD COLUMN igst_amount DECIMAL(12,2) DEFAULT 0.00 AFTER sgst_amount;
