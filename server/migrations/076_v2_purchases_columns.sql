-- Migration 076: Add missing columns to v2_purchases table if not existing
ALTER TABLE v2_purchases ADD COLUMN taxable_amount DECIMAL(12,2) DEFAULT 0.00 AFTER invoice_number;
ALTER TABLE v2_purchases ADD COLUMN previous_balance DECIMAL(12,2) DEFAULT 0.00 AFTER total_amount;
ALTER TABLE v2_purchases ADD COLUMN running_balance DECIMAL(12,2) DEFAULT 0.00 AFTER previous_balance;
