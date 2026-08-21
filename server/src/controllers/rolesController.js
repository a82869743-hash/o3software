const pool = require('../config/db');

// List all roles
exports.listRoles = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM v2_roles ORDER BY is_system_role DESC, id ASC');
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List roles error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Create a role
exports.createRole = async (req, res) => {
  try {
    const { role_name, description } = req.body;
    if (!role_name) return res.status(400).json({ success: false, error: 'Role name is required' });

    const [existing] = await pool.query('SELECT id FROM v2_roles WHERE role_name = ?', [role_name]);
    if (existing.length) return res.status(400).json({ success: false, error: 'Role name already exists' });

    const [result] = await pool.query(
      'INSERT INTO v2_roles (role_name, description, is_system_role) VALUES (?, ?, 0)',
      [role_name, description || '']
    );

    res.status(201).json({ success: true, data: { id: result.insertId, role_name, description }, message: 'Role created' });
  } catch (err) {
    console.error('Create role error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Update a role
exports.updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role_name, description } = req.body;

    const [existing] = await pool.query('SELECT * FROM v2_roles WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Role not found' });
    if (existing[0].is_system_role === 1) return res.status(400).json({ success: false, error: 'System roles cannot be modified' });

    await pool.query(
      'UPDATE v2_roles SET role_name = ?, description = ? WHERE id = ?',
      [role_name || existing[0].role_name, description !== undefined ? description : existing[0].description, id]
    );

    res.json({ success: true, message: 'Role updated successfully' });
  } catch (err) {
    console.error('Update role error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Delete a role
exports.deleteRole = async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.query('SELECT * FROM v2_roles WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Role not found' });
    if (existing[0].is_system_role === 1) return res.status(400).json({ success: false, error: 'System roles cannot be deleted' });

    // Wipe role permissions and references
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM v2_role_permissions WHERE role_id = ?', [id]);
      await conn.query('UPDATE users SET custom_role_id = NULL WHERE custom_role_id = ?', [id]);
      await conn.query('DELETE FROM v2_roles WHERE id = ?', [id]);
      await conn.commit();
      res.json({ success: true, message: 'Role deleted successfully' });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Delete role error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Get permissions list of a role
exports.getRolePermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT permission_id FROM v2_role_permissions WHERE role_id = ?', [id]);
    res.json({ success: true, data: rows.map(r => r.permission_id) });
  } catch (err) {
    console.error('Get role permissions error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Save permissions checklist for a role
exports.saveRolePermissions = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { permission_ids } = req.body; // Array of integers

    if (!Array.isArray(permission_ids)) {
      return res.status(400).json({ success: false, error: 'permission_ids must be an array' });
    }

    // Clear existing
    await conn.query('DELETE FROM v2_role_permissions WHERE role_id = ?', [id]);

    // Insert new
    for (const pId of permission_ids) {
      await conn.query('INSERT INTO v2_role_permissions (role_id, permission_id) VALUES (?, ?)', [id, pId]);
    }

    await conn.commit();
    res.json({ success: true, message: 'Permissions updated successfully' });
  } catch (err) {
    await conn.rollback();
    console.error('Save role permissions error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// Helper: Get all system permissions list
exports.listAllPermissions = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM v2_permissions ORDER BY module ASC, id ASC');
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List all permissions error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
