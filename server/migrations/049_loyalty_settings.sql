-- ═══════════════════════════════════════════════════════════
-- PHASE 2: Loyalty Settings
-- Configurable loyalty point ratio and redemption rules.
-- Stored in the existing settings table as key-value pairs.
-- ═══════════════════════════════════════════════════════════

-- Insert default loyalty settings (only if they don't exist)
INSERT IGNORE INTO settings (key_name, value)
VALUES
  ('loyalty_points_ratio', '100'),
  ('loyalty_min_redeem', '50'),
  ('loyalty_point_value', '1'),
  ('loyalty_enabled', '1');
