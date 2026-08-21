CREATE TABLE IF NOT EXISTS settings (
  id         INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  key_name   VARCHAR(100)  NOT NULL,
  value      TEXT          NULL,
  updated_at TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_key_name (key_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO settings (key_name, value) VALUES
  ('studio_name',          'O3 Car Spa'),
  ('studio_address',       'Vadodara, Gujarat, India'),
  ('studio_mobile',        ''),
  ('studio_email',         ''),
  ('studio_gst',           ''),
  ('invoice_prefix',       'GKA'),
  ('invoice_counter',      '1000'),
  ('booking_advance_days', '2'),
  ('admin_whatsapp',       ''),
  ('low_stock_threshold',  '5')
ON DUPLICATE KEY UPDATE key_name = key_name;
