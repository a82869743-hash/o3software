CREATE TABLE IF NOT EXISTS bookings (
  id           INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  customer_id  INT UNSIGNED  NOT NULL,
  slot_id      INT UNSIGNED  NOT NULL,
  service_id   INT UNSIGNED  NULL,
  package_id   INT UNSIGNED  NULL,
  vehicle_brand VARCHAR(80)  NULL,
  vehicle_model VARCHAR(80)  NULL,
  vehicle_reg_no VARCHAR(20) NULL,
  status       ENUM('confirmed','cancelled','completed') NOT NULL DEFAULT 'confirmed',
  is_free_wash TINYINT(1)    NOT NULL DEFAULT 0,
  notes        TEXT          NULL,
  created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer_id (customer_id),
  INDEX idx_slot_id (slot_id),
  FOREIGN KEY (customer_id) REFERENCES users(id),
  FOREIGN KEY (slot_id) REFERENCES slots(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
