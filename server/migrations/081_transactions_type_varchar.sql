-- Migration 081: Alter transactions type column from ENUM to VARCHAR(50)
ALTER TABLE transactions MODIFY COLUMN type VARCHAR(50) NOT NULL;
