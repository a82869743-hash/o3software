CREATE TABLE IF NOT EXISTS inventory (
  id                  INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
  product_name        VARCHAR(150)   NOT NULL,
  unit                VARCHAR(30)    NOT NULL DEFAULT 'pcs',
  quantity            DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  low_stock_threshold DECIMAL(10,2)  NOT NULL DEFAULT 5.00,
  is_deleted          TINYINT(1)     NOT NULL DEFAULT 0,
  created_at          TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_product_name (product_name),
  INDEX idx_is_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
