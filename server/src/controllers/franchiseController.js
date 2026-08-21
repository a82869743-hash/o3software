const pool = require('../config/db');

// List all active franchises
exports.list = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM franchises WHERE is_active = 1 ORDER BY id ASC');
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List franchises error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch franchises' });
  }
};

// Create a new franchise location
exports.create = async (req, res) => {
  try {
    const { name, code, address, phone } = req.body;
    if (!name || !code) {
      return res.status(400).json({ success: false, error: 'Franchise name and code are required' });
    }

    const cleanCode = code.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');

    const [result] = await pool.query(
      'INSERT INTO franchises (name, code, address, phone) VALUES (?, ?, ?, ?)',
      [name.trim(), cleanCode, address || null, phone || null]
    );

    res.status(201).json({
      success: true,
      data: { id: result.insertId, name: name.trim(), code: cleanCode },
      message: `Franchise "${name}" created successfully`
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, error: 'Franchise code already exists' });
    }
    console.error('Create franchise error:', err);
    res.status(500).json({ success: false, error: 'Failed to create franchise' });
  }
};
