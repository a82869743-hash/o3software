CREATE TABLE IF NOT EXISTS quotations (
  id               INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
  quotation_number VARCHAR(50)    NOT NULL UNIQUE,
  customer_name    VARCHAR(150)   NOT NULL,
  customer_mobile  VARCHAR(20)    NOT NULL,
  customer_email   VARCHAR(150)   NULL,
  vehicle_no       VARCHAR(50)    NULL,
  car_brand        VARCHAR(100)   NULL,
  car_model        VARCHAR(100)   NULL,
  car_segment      VARCHAR(50)    NULL,
  subtotal         DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  discount_type    ENUM('fixed', 'percentage') DEFAULT 'fixed',
  discount_value   DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  discount_amount  DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  tax_percentage   DECIMAL(10,2)  NOT NULL DEFAULT 18.00,
  tax_amount       DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  grand_total      DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  valid_until      DATE           NULL,
  notes            TEXT           NULL,
  status           ENUM('draft', 'sent', 'accepted', 'declined', 'voided') DEFAULT 'draft',
  created_by       INT UNSIGNED   NULL,
  created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotation_items (
  id               INT UNSIGNED   AUTO_INCREMENT PRIMARY KEY,
  quotation_id     INT UNSIGNED   NOT NULL,
  item_type        ENUM('service', 'package', 'custom') NOT NULL,
  item_id          INT UNSIGNED   NULL,
  name             VARCHAR(255)   NOT NULL,
  price            DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  quantity         INT UNSIGNED   NOT NULL DEFAULT 1,
  total            DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
