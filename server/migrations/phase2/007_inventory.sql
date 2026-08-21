-- ═══════════════════════════════════════════════════
-- Phase 2 v2: 007 — Inventory Extended
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS v2_vendors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  contact_person VARCHAR(100) DEFAULT NULL,
  phone VARCHAR(15) DEFAULT NULL,
  email VARCHAR(100) DEFAULT NULL,
  address TEXT DEFAULT NULL,
  gstin VARCHAR(20) DEFAULT NULL,
  payment_terms TEXT DEFAULT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS v2_inventory_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_name VARCHAR(200) NOT NULL,
  sku VARCHAR(100) DEFAULT NULL UNIQUE,
  barcode VARCHAR(100) DEFAULT NULL,
  category VARCHAR(100) DEFAULT NULL,
  unit VARCHAR(20) DEFAULT 'pcs',
  current_stock INT DEFAULT 0,
  min_stock_level INT DEFAULT 5,
  max_stock_level INT DEFAULT 100,
  purchase_price DECIMAL(10,2) DEFAULT NULL,
  selling_price DECIMAL(10,2) DEFAULT NULL,
  vendor_id INT DEFAULT NULL,
  location VARCHAR(100) DEFAULT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  image_url VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_stock (current_stock, min_stock_level),
  FOREIGN KEY (vendor_id) REFERENCES v2_vendors(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS v2_inventory_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_id INT NOT NULL,
  movement_type ENUM('purchase_in','usage_out','adjustment','return','damaged') NOT NULL,
  quantity INT NOT NULL,
  stock_before INT NOT NULL DEFAULT 0,
  stock_after INT NOT NULL DEFAULT 0,
  reference_type VARCHAR(50) DEFAULT NULL,
  reference_id INT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  performed_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_item (item_id),
  INDEX idx_type (movement_type),
  FOREIGN KEY (item_id) REFERENCES v2_inventory_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS v2_purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  purchase_date DATE NOT NULL,
  invoice_number VARCHAR(100) DEFAULT NULL,
  total_amount DECIMAL(10,2) DEFAULT NULL,
  tax_amount DECIMAL(10,2) DEFAULT NULL,
  status ENUM('pending','received','partial','cancelled') DEFAULT 'pending',
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vendor (vendor_id),
  INDEX idx_status (status),
  FOREIGN KEY (vendor_id) REFERENCES v2_vendors(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS v2_purchase_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  purchase_id INT NOT NULL,
  item_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  received_quantity INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (purchase_id) REFERENCES v2_purchases(id),
  FOREIGN KEY (item_id) REFERENCES v2_inventory_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
