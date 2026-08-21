-- ═══════════════════════════════════════════════════
-- Phase 2 v2: 012 — File Attachments & Tracking History
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS v2_file_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  file_name VARCHAR(255) DEFAULT NULL,
  file_url VARCHAR(500) NOT NULL,
  file_type ENUM('image','pdf','video') NOT NULL DEFAULT 'image',
  reference_type VARCHAR(50) DEFAULT NULL,
  reference_id INT DEFAULT NULL,
  uploaded_by INT DEFAULT NULL,
  cloudinary_public_id VARCHAR(255) DEFAULT NULL,
  is_before_image BOOLEAN DEFAULT FALSE,
  is_after_image BOOLEAN DEFAULT FALSE,
  file_size INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_reference (reference_type, reference_id),
  INDEX idx_uploader (uploaded_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS v2_tracking_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_cart_id INT UNSIGNED NOT NULL,
  stage VARCHAR(100) NOT NULL,
  changed_by INT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_job_cart (job_cart_id),
  FOREIGN KEY (job_cart_id) REFERENCES job_carts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
