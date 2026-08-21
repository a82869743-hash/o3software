CREATE TABLE IF NOT EXISTS packages (
  id               INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(150)   NOT NULL,
  description      TEXT           NULL,
  price_hatchback  DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  price_sedan      DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  price_suv        DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  wash_count       INT UNSIGNED   NOT NULL DEFAULT 0,
  wax_count        INT UNSIGNED   NOT NULL DEFAULT 0,
  is_published     TINYINT(1)     NOT NULL DEFAULT 0,
  created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
