CREATE TABLE IF NOT EXISTS job_photos (
  id          INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  job_cart_id INT UNSIGNED  NOT NULL,
  type        ENUM('before','after') NOT NULL,
  url         VARCHAR(500)  NOT NULL,
  public_id   VARCHAR(200)  NULL,
  uploaded_at TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_job_cart_id (job_cart_id),
  FOREIGN KEY (job_cart_id) REFERENCES job_carts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
