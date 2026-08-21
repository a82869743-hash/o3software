-- ═══════════════════════════════════════════════════════════
-- MIGRATION 088: Franchise Stock Request Module
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS franchise_stock_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  franchise_id INT NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  requested_quantity INT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  rejection_reason VARCHAR(255) NULL,
  approved_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (franchise_id) REFERENCES franchises(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES inventory(id) ON DELETE CASCADE,
  INDEX idx_franchise_req (franchise_id),
  INDEX idx_req_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
