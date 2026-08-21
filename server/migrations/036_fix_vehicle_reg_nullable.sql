-- Fix: Allow registration_no to be NULL since it's optional during car addition
ALTER TABLE vehicles MODIFY COLUMN registration_no VARCHAR(20) NULL DEFAULT NULL;

-- Drop the strict unique constraint on registration_no
-- Multiple cars can now have NULL registration numbers
ALTER TABLE vehicles DROP INDEX uq_reg_no;
