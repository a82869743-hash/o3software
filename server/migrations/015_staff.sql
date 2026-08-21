CREATE TABLE IF NOT EXISTS staff_profiles (
  id               INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  user_id          INT UNSIGNED  NOT NULL,
  specialisations  TEXT          NULL,
  UNIQUE KEY uq_user_id (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_attendance (
  id       INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  staff_id INT UNSIGNED  NOT NULL,
  att_date DATE          NOT NULL,
  status   ENUM('present','absent','half_day') NOT NULL DEFAULT 'present',
  note     VARCHAR(255)  NULL,
  UNIQUE KEY uq_staff_date (staff_id, att_date),
  FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_payments (
  id           INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
  staff_id     INT UNSIGNED   NOT NULL,
  amount       DECIMAL(10,2)  NOT NULL,
  purpose      VARCHAR(255)   NOT NULL,
  status       ENUM('pending','paid') NOT NULL DEFAULT 'pending',
  payment_date DATE           NOT NULL,
  created_at   TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  paid_at      TIMESTAMP      NULL,
  INDEX idx_staff_id (staff_id),
  FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
