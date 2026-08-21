CREATE TABLE IF NOT EXISTS vehicle_master (
  id INT AUTO_INCREMENT PRIMARY KEY,
  make VARCHAR(100) NOT NULL,
  model VARCHAR(150) NOT NULL,
  variant VARCHAR(200) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_make (make),
  INDEX idx_model (model),
  INDEX idx_make_model (make, model)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
