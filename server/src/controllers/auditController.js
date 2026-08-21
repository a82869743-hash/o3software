const pool = require('../config/db');

// ─── Log an audit event ─────────────────────────────
exports.logAudit = async (userId, action, entityType, entityId, details = null, ipAddress = null) => {
  try {
    const eId = parseInt(entityId) || 0;
    await pool.query(
      `INSERT INTO audit_logs (changed_by, action, entity_type, entity_id, new_value, ip_address) VALUES (?,?,?,?,?,?)`,
      [userId, action, entityType, eId, details ? JSON.stringify(details) : null, ipAddress]
    );
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
};

// ─── Get audit logs (admin) ─────────────────────────
exports.getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 30, action, entity_type, user_id, from, to } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1']; const params = [];
    if (action) { where.push('a.action = ?'); params.push(action); }
    if (entity_type) { where.push('a.entity_type = ?'); params.push(entity_type); }
    if (user_id) { where.push('a.changed_by = ?'); params.push(user_id); }
    if (from) { where.push('a.created_at >= ?'); params.push(from); }
    if (to) { where.push('a.created_at <= ?'); params.push(`${to} 23:59:59`); }

    const [cnt] = await pool.query(`SELECT COUNT(*) as total FROM audit_logs a WHERE ${where.join(' AND ')}`, params);
    const [rows] = await pool.query(`
      SELECT a.*, u.name as user_name, u.role as user_role
      FROM audit_logs a LEFT JOIN users u ON u.id = a.changed_by
      WHERE ${where.join(' AND ')} ORDER BY a.created_at DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), parseInt(offset)]);

    res.json({ success: true, data: rows, pagination: { page: parseInt(page), limit: parseInt(limit), total: cnt[0].total } });
  } catch (err) {
    console.error('getAuditLogs error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
  }
};

// ─── Get audit log actions summary ──────────────────
exports.getAuditSummary = async (req, res) => {
  try {
    const [actions] = await pool.query(`
      SELECT action, COUNT(*) as count FROM audit_logs
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY action ORDER BY count DESC LIMIT 20
    `);
    const [recent] = await pool.query(`
      SELECT a.*, u.name as user_name FROM audit_logs a
      LEFT JOIN users u ON u.id = a.changed_by
      ORDER BY a.created_at DESC LIMIT 10
    `);
    res.json({ success: true, data: { actions, recent } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch audit summary' });
  }
};
