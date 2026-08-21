-- ═══════════════════════════════════════════════════════════
-- MIGRATION 090: Multiple Payment QR Code Management
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_qrs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  upi_id VARCHAR(100) NOT NULL,
  upi_name VARCHAR(100) NOT NULL DEFAULT 'O3 Car Spa',
  qr_image_url VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default active QR if table is empty
INSERT INTO payment_qrs (title, upi_id, upi_name, qr_image_url, is_active)
SELECT 'O3 Car Spa Main UPI', '7225030303@paytm', 'O3 Car Spa Anand', '/uploads/qr/default_qr.png', 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM payment_qrs);
