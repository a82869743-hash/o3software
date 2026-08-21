-- Add pickup columns to job_carts to resolve schema drift
ALTER TABLE job_carts ADD COLUMN pickup_type ENUM('none', 'pickup', 'drop', 'both') DEFAULT 'none';
ALTER TABLE job_carts ADD COLUMN pickup_charge DECIMAL(10,2) DEFAULT 0.00;
