CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100)    NOT NULL,
  mobile        VARCHAR(15)     NOT NULL,
  email         VARCHAR(150)    NULL,
  password_hash VARCHAR(255)    NOT NULL,
  role          ENUM('admin','customer','staff') NOT NULL DEFAULT 'customer',
  is_active     TINYINT(1)      NOT NULL DEFAULT 1,
  created_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mobile (mobile),
  UNIQUE KEY uq_email (email),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
