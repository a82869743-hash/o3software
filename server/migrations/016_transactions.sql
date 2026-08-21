CREATE TABLE IF NOT EXISTS transactions (
  id               INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
  type             ENUM('job_revenue','purchase','sale_b2b','sale_b2c','staff_payment','loyalty_award') NOT NULL,
  reference_id     INT UNSIGNED   NULL,
  amount           DECIMAL(10,2)  NOT NULL,
  direction        ENUM('in','out') NOT NULL,
  note             TEXT           NULL,
  transaction_date DATE           NOT NULL,
  created_by       INT UNSIGNED   NOT NULL,
  created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_type (type),
  INDEX idx_transaction_date (transaction_date),
  INDEX idx_direction (direction),
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
