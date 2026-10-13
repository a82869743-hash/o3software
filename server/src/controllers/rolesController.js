const pool = require('../config/db');
const { getFranchiseEntitlements } = require('../middleware/permissions');

// List roles (Super Admin sees all; Franchise Admin sees system templates + own franchise custom roles)
exports.listRoles = async (req, res) => {
  try {
    const isSuper = req.user && req.user.role === 'super_admin';
    const fid = req.franchiseId || 1;

    const sql = isSuper
      ? 'SELECT * FROM v2_roles ORDER BY is_system_role DESC, id ASC'
      : 'SELECT * FROM v2_roles WHERE is_system_role = 1 OR franchise_id = ? ORDER BY is_system_role DESC, id ASC';

    const [rows] = await pool.query(sql, isSuper ? [] : [fid]);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List roles error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Create a custom role (scoped to franchise)
exports.createRole = async (req, res) => {
  try {
    const { role_name, description } = req.body;
    if (!role_name || !role_name.trim()) {
      return res.status(400).json({ success: false, error: 'Role name is required' });
    }

    const isSuper = req.user && req.user.role === 'super_admin';
    const fid = isSuper ? (req.body.franchise_id || null) : (req.franchiseId || 1);

    // Check uniqueness within franchise scope
    const [existing] = await pool.query(
      'SELECT id FROM v2_roles WHERE role_name = ? AND (franchise_id = ? OR franchise_id IS NULL)',
      [role_name.trim(), fid]
    );
    if (existing.length) {
      return res.status(400).json({ success: false, error: `Role name "${role_name}" already exists` });
    }

    const [result] = await pool.query(
      'INSERT INTO v2_roles (role_name, description, is_system_role, franchise_id) VALUES (?, ?, 0, ?)',
      [role_name.trim(), description || '', fid]
    );

    res.status(201).json({
      success: true,
      data: { id: result.insertId, role_name: role_name.trim(), description, franchise_id: fid },
      message: 'Custom role created successfully'
    });
  } catch (err) {
    console.error('Create role error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Update a custom role
exports.updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role_name, description } = req.body;

    const [existing] = await pool.query('SELECT * FROM v2_roles WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Role not found' });
    if (existing[0].is_system_role === 1) {
      return res.status(400).json({ success: false, error: 'System template roles cannot be modified' });
    }

    const isSuper = req.user && req.user.role === 'super_admin';
    if (!isSuper && existing[0].franchise_id !== req.franchiseId) {
      return res.status(403).json({ success: false, error: 'Cannot modify custom roles of another franchise' });
    }

    await pool.query(
      'UPDATE v2_roles SET role_name = ?, description = ? WHERE id = ?',
      [role_name ? role_name.trim() : existing[0].role_name, description !== undefined ? description : existing[0].description, id]
    );

    res.json({ success: true, message: 'Role updated successfully' });
  } catch (err) {
    console.error('Update role error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Delete a custom role
exports.deleteRole = async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.query('SELECT * FROM v2_roles WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Role not found' });
    if (existing[0].is_system_role === 1) {
      return res.status(400).json({ success: false, error: 'System template roles cannot be deleted' });
    }

    const isSuper = req.user && req.user.role === 'super_admin';
    if (!isSuper && existing[0].franchise_id !== req.franchiseId) {
      return res.status(403).json({ success: false, error: 'Cannot delete custom roles of another franchise' });
    }

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

// Save permissions checklist for a role (Enforces Entitlement Ceiling!)
exports.saveRolePermissions = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { permission_ids } = req.body;

    if (!Array.isArray(permission_ids)) {
      return res.status(400).json({ success: false, error: 'permission_ids must be an array' });
    }

    const [roleRows] = await conn.query('SELECT * FROM v2_roles WHERE id = ?', [id]);
    if (!roleRows.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Role not found' });
    }

    const isSuper = req.user && req.user.role === 'super_admin';
    const roleFranchiseId = roleRows[0].franchise_id || req.franchiseId || 1;

    // Check ownership of custom role
    if (!isSuper && roleRows[0].franchise_id !== req.franchiseId) {
      await conn.rollback();
      return res.status(403).json({ success: false, error: 'Cannot manage permissions for another franchise\'s role' });
    }

    // ─── STRICT ENTITLEMENT CEILING ENFORCEMENT ─────────────
    if (!isSuper && permission_ids.length > 0) {
      const entitlements = await getFranchiseEntitlements(roleFranchiseId);

      // Fetch permission module & action for all requested IDs
      const [requestedPerms] = await conn.query(
        'SELECT id, permission_key, module, action FROM v2_permissions WHERE id IN (?)',
        [permission_ids]
      );

      for (const p of requestedPerms) {
        const ent = entitlements[p.module];
        // If module is disabled in franchise entitlements, reject!
        if (!ent || !ent.is_enabled) {
          await conn.rollback();
          return res.status(403).json({
            success: false,
            error: `Cannot assign permission "${p.permission_key}": module "${p.module}" is disabled in your franchise entitlement plan.`
          });
        }
        // If action is restricted by entitlement actions list, reject!
        if (Array.isArray(ent.actions) && ent.actions.length > 0 && !ent.actions.includes(p.action)) {
          await conn.rollback();
          return res.status(403).json({
            success: false,
            error: `Cannot assign action "${p.action}" on "${p.module}": action is restricted by your franchise entitlement ceiling.`
          });
        }
      }
    }

    // Clear existing
    await conn.query('DELETE FROM v2_role_permissions WHERE role_id = ?', [id]);

    // Insert new
    for (const pId of permission_ids) {
      await conn.query('INSERT INTO v2_role_permissions (role_id, permission_id) VALUES (?, ?)', [id, pId]);
    }

    await conn.commit();
    res.json({ success: true, message: 'Role permissions saved within entitlement ceiling successfully' });
  } catch (err) {
    await conn.rollback();
    console.error('Save role permissions error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// List available permissions (Filtered by Franchise Entitlement Ceiling!)
exports.listAllPermissions = async (req, res) => {
  try {
    const isSuper = req.user && req.user.role === 'super_admin';
    const [allPerms] = await pool.query('SELECT * FROM v2_permissions ORDER BY module ASC, id ASC');

    if (isSuper) {
      return res.json({ success: true, data: allPerms });
    }

    // Franchise Admin: filter permissions to only include features enabled in their franchise
    const fid = req.franchiseId || 1;
    const entitlements = await getFranchiseEntitlements(fid);

    const allowed = allPerms.filter(p => {
      const ent = entitlements[p.module];
      if (!ent || !ent.is_enabled) return false;
      if (Array.isArray(ent.actions) && ent.actions.length > 0 && !ent.actions.includes(p.action)) return false;
      return true;
    });

    res.json({ success: true, data: allowed });
  } catch (err) {
    console.error('List all permissions error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
