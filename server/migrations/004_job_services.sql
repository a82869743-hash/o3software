CREATE TABLE IF NOT EXISTS job_services (
  id            INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  job_cart_id   INT UNSIGNED    NOT NULL,
  service_name  VARCHAR(150)    NOT NULL,
  service_price DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  labor_charges DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  created_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_job_cart_id (job_cart_id),
  FOREIGN KEY (job_cart_id) REFERENCES job_carts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
