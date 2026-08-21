CREATE TABLE IF NOT EXISTS job_products (
  id             INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
  job_service_id INT UNSIGNED   NOT NULL,
  product_id     INT UNSIGNED   NOT NULL,
  quantity       DECIMAL(10,2)  NOT NULL,
  unit_cost      DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  INDEX idx_job_service_id (job_service_id),
  FOREIGN KEY (job_service_id) REFERENCES job_services(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES inventory(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
