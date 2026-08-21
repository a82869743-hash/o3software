CREATE TABLE IF NOT EXISTS inquiries (
  id                  INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  source              ENUM('staff','website') NOT NULL,
  name                VARCHAR(100)  NOT NULL,
  mobile              VARCHAR(15)   NOT NULL,
  email               VARCHAR(150)  NULL,
  vehicle_brand       VARCHAR(80)   NULL,
  vehicle_model       VARCHAR(80)   NULL,
  services_interested TEXT          NULL,
  status              ENUM('new','followed_up','converted') NOT NULL DEFAULT 'new',
  submitted_by        INT UNSIGNED  NULL,
  created_at          TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_source (source),
  INDEX idx_status (status),
  FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
