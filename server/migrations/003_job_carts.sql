CREATE TABLE IF NOT EXISTS job_carts (
  id           INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  vehicle_id   INT UNSIGNED  NOT NULL,
  visit_date   DATE          NOT NULL,
  visit_number INT UNSIGNED  NOT NULL DEFAULT 1,
  status       ENUM('draft','open','complete') NOT NULL DEFAULT 'draft',
  notes        TEXT          NULL,
  created_by   INT UNSIGNED  NOT NULL,
  created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at    TIMESTAMP     NULL,
  invoice_number  VARCHAR(50)   NULL,
  INDEX idx_vehicle_id (vehicle_id),
  INDEX idx_status (status),
  INDEX idx_created_by (created_by),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
