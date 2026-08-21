CREATE TABLE IF NOT EXISTS vehicles (
  id              INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  registration_no VARCHAR(20)   NOT NULL,
  customer_id     INT UNSIGNED  NOT NULL,
  brand           VARCHAR(80)   NOT NULL,
  model           VARCHAR(80)   NOT NULL,
  created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reg_no (registration_no),
  INDEX idx_customer_id (customer_id),
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
