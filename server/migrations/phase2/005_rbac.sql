-- ═══════════════════════════════════════════════════
-- Phase 2 v2: 005 — RBAC System
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS v2_roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT DEFAULT NULL,
  is_system_role BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS v2_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  permission_key VARCHAR(100) NOT NULL UNIQUE,
  module VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  description TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_module (module)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS v2_role_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES v2_roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES v2_permissions(id) ON DELETE CASCADE,
  UNIQUE KEY unique_role_permission (role_id, permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed roles
INSERT IGNORE INTO v2_roles (role_name, description, is_system_role) VALUES
('super_admin', 'Full system access', TRUE),
('admin', 'Administrative access', TRUE),
('manager', 'Manager-level access', FALSE),
('staff', 'Workshop staff access', FALSE),
('billing', 'Billing and invoicing access', FALSE),
('inventory_manager', 'Inventory management access', FALSE);

-- Seed permissions
INSERT IGNORE INTO v2_permissions (permission_key, module, action, description) VALUES
('customers.view', 'customers', 'view', 'View customer list and details'),
('customers.create', 'customers', 'create', 'Create new customers'),
('customers.edit', 'customers', 'edit', 'Edit customer information'),
('customers.delete', 'customers', 'delete', 'Delete customers'),
('bookings.view', 'bookings', 'view', 'View bookings'),
('bookings.create', 'bookings', 'create', 'Create bookings'),
('bookings.approve', 'bookings', 'approve', 'Approve bookings'),
('bookings.reject', 'bookings', 'reject', 'Reject bookings'),
('packages.view', 'packages', 'view', 'View packages'),
('packages.create', 'packages', 'create', 'Create packages'),
('packages.approve', 'packages', 'approve', 'Approve packages'),
('payments.view', 'payments', 'view', 'View payment history'),
('payments.refund', 'payments', 'refund', 'Process refunds'),
('inventory.view', 'inventory', 'view', 'View inventory'),
('inventory.create', 'inventory', 'create', 'Add inventory items'),
('inventory.edit', 'inventory', 'edit', 'Edit inventory items'),
('accounts.view', 'accounts', 'view', 'View financial reports'),
('accounts.create', 'accounts', 'create', 'Add expenses and records'),
('staff.view', 'staff', 'view', 'View staff list'),
('staff.create', 'staff', 'create', 'Add staff members'),
('staff.edit', 'staff', 'edit', 'Edit staff details'),
('reports.view', 'reports', 'view', 'View reports'),
('reports.export', 'reports', 'export', 'Export reports'),
('settings.view', 'settings', 'view', 'View settings'),
('settings.edit', 'settings', 'edit', 'Edit settings'),
('notifications.send', 'notifications', 'send', 'Send notifications');

-- Assign ALL permissions to super_admin
INSERT IGNORE INTO v2_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM v2_roles r, v2_permissions p
WHERE r.role_name = 'super_admin';

-- Assign most permissions to admin (except settings.edit)
INSERT IGNORE INTO v2_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM v2_roles r, v2_permissions p
WHERE r.role_name = 'admin' AND p.permission_key != 'settings.edit';
