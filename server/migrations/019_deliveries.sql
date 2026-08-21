CREATE TABLE IF NOT EXISTS deliveries (
  id           INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  job_cart_id  INT UNSIGNED  NOT NULL,
  staff_id     INT UNSIGNED  NOT NULL,
  customer_id  INT UNSIGNED  NOT NULL,
  status       ENUM('in_transit','delivered') NOT NULL DEFAULT 'in_transit',
  started_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP     NULL,
  UNIQUE KEY uq_job_cart (job_cart_id),
  INDEX idx_staff_id (staff_id),
  INDEX idx_status (status),
  FOREIGN KEY (job_cart_id) REFERENCES job_carts(id),
  FOREIGN KEY (staff_id) REFERENCES users(id),
  FOREIGN KEY (customer_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
