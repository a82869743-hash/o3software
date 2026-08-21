-- Migration 062: Add job_cart_id to v2_payments table
ALTER TABLE v2_payments ADD COLUMN job_cart_id INT DEFAULT NULL AFTER customer_id;
