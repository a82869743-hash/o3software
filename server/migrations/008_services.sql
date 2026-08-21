CREATE TABLE IF NOT EXISTS services (
  id               INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(150)   NOT NULL,
  description      TEXT           NULL,
  price_hatchback  DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  price_sedan      DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  price_suv        DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  is_active        TINYINT(1)     NOT NULL DEFAULT 1,
  created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
