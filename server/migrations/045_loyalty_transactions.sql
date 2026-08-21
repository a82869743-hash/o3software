-- ═══════════════════════════════════════════════════════════
-- PHASE 2: Loyalty Points Transaction System
-- Dedicated table for tracking point earn/redeem history.
-- Separate from the generic 'transactions' table.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id            INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  customer_id   INT UNSIGNED  NOT NULL,
  type          ENUM('earn','redeem','bonus','adjustment','expire') NOT NULL DEFAULT 'earn',
  points        DECIMAL(10,2) NOT NULL DEFAULT 0
    COMMENT 'Positive for earn, negative for redeem',
  balance_after DECIMAL(10,2) NOT NULL DEFAULT 0
    COMMENT 'Running balance after this transaction',
  reference_type VARCHAR(50) NULL
    COMMENT 'invoice, job_card, manual, package_purchase, etc.',
  reference_id  INT UNSIGNED NULL
    COMMENT 'ID of the related entity (invoice_id, job_cart_id, etc.)',
  description   VARCHAR(500) NULL,
  created_by    INT UNSIGNED NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_customer (customer_id),
  INDEX idx_type (type),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add loyalty points column to loyalty table (separate from credits)
ALTER TABLE loyalty
  ADD COLUMN points DECIMAL(10,2) NOT NULL DEFAULT 0
    COMMENT 'Loyalty points balance (configurable earn ratio)';
