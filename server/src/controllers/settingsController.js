const pool = require('../config/db');

// ─── GET PUBLIC SETTINGS (For Customer Checkout & Header) ─
exports.getPublicSettings = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT key_name, value FROM settings');
    const settingsMap = rows.reduce((acc, curr) => {
      acc[curr.key_name] = curr.value;
      return acc;
    }, {});

    // Fetch all active / available payment QR codes
    let allQrs = [];
    let activeQr = null;
    try {
      const [qrRows] = await pool.query('SELECT * FROM payment_qrs ORDER BY is_active DESC, id DESC');
      allQrs = qrRows;
      activeQr = qrRows.find(q => q.is_active === 1) || qrRows[0] || null;
    } catch { /* fallback if table missing */ }

    res.json({
      success: true,
      data: {
        studio_name: settingsMap.studio_name || 'O3 Car Spa',
        tagline: settingsMap.tagline || 'Premium Car Detailing Studio',
        mobile: settingsMap.mobile || '7225030303',
        email: settingsMap.email || 'o3carspavvn@gmail.com',
        address: settingsMap.address || 'Plot No. 37, Zone No. D5, Opp. Bank of Baroda, GIDC, Vitthal Udyognagar, Anand, Gujarat (388121)',
        upi_id: activeQr ? activeQr.upi_id : (settingsMap.upi_id || '7225030303@paytm'),
        upi_number: activeQr ? activeQr.upi_number : (settingsMap.upi_number || '7225030303'),
        upi_name: activeQr ? activeQr.upi_name : (settingsMap.upi_name || 'O3 Car Spa'),
        upi_qr_url: activeQr ? activeQr.qr_image_url : (settingsMap.upi_qr_url || null),
        active_qr: activeQr,
        all_qrs: allQrs,
      }
    });
  } catch (err) {
    console.error('Settings getPublicSettings error:', err);
    res.json({
      success: true,
      data: {
        studio_name: 'O3 Car Spa',
        tagline: 'Premium Car Detailing Studio',
        mobile: '7225030303',
        email: 'o3carspavvn@gmail.com',
        address: 'Plot No. 37, Zone No. D5, Opp. Bank of Baroda, GIDC, Vitthal Udyognagar, Anand, Gujarat (388121)',
        upi_id: '7225030303@paytm',
        upi_number: '7225030303',
        upi_name: 'O3 Car Spa',
        upi_qr_url: null,
        all_qrs: [],
      }
    });
  }
};

// ─── GET ALL PAYMENT QRS ─────────────────────
exports.listPaymentQrs = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM payment_qrs ORDER BY is_active DESC, id DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('listPaymentQrs error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CREATE PAYMENT QR ───────────────────────
exports.createPaymentQr = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { title, upi_id, upi_name, upi_number, qr_image_url, is_active } = req.body;
    if (!title || !upi_id) {
      return res.status(400).json({ success: false, error: 'Title and UPI ID required' });
    }

    await conn.beginTransaction();

    const makeActive = is_active ? 1 : 0;
    if (makeActive === 1) {
      await conn.query('UPDATE payment_qrs SET is_active = 0');
    }

    const [result] = await conn.query(
      'INSERT INTO payment_qrs (title, upi_id, upi_name, upi_number, qr_image_url, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [title, upi_id, upi_name || 'O3 Car Spa', upi_number || '7225030303', qr_image_url || null, makeActive]
    );

    await conn.commit();
    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Payment QR added' });
  } catch (err) {
    await conn.rollback();
    console.error('createPaymentQr error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── SET ACTIVE PAYMENT QR ───────────────────
exports.setActivePaymentQr = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    await conn.beginTransaction();

    await conn.query('UPDATE payment_qrs SET is_active = 0');
    await conn.query('UPDATE payment_qrs SET is_active = 1 WHERE id = ?', [id]);

    await conn.commit();
    res.json({ success: true, message: `Payment QR #${id} set as active for customer side display.` });
  } catch (err) {
    await conn.rollback();
    console.error('setActivePaymentQr error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── DELETE PAYMENT QR ───────────────────────
exports.deletePaymentQr = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    await conn.beginTransaction();

    const [rows] = await conn.query('SELECT is_active FROM payment_qrs WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Payment QR not found' });

    const wasActive = rows[0].is_active === 1;
    await conn.query('DELETE FROM payment_qrs WHERE id = ?', [id]);

    // If active QR was deleted, set the most recent remaining QR as active
    if (wasActive) {
      const [remaining] = await conn.query('SELECT id FROM payment_qrs ORDER BY id DESC LIMIT 1');
      if (remaining.length) {
        await conn.query('UPDATE payment_qrs SET is_active = 1 WHERE id = ?', [remaining[0].id]);
      }
    }

    await conn.commit();
    res.json({ success: true, message: 'Payment QR removed' });
  } catch (err) {
    await conn.rollback();
    console.error('deletePaymentQr error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── GET ALL SETTINGS ─────────────────────
exports.getAll = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT key_name, value FROM settings');
    const settingsMap = rows.reduce((acc, curr) => {
      acc[curr.key_name] = curr.value;
      return acc;
    }, {});

    res.json({ success: true, data: settingsMap });
  } catch (err) {
    console.error('Settings getAll error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── UPDATE MULTIPLE SETTINGS ─────────────
exports.updateAll = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid payload' });
    }

    await conn.beginTransaction();

    for (const [key, value] of Object.entries(updates)) {
      await conn.query(
        'INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
        [key, value !== null ? String(value) : '', value !== null ? String(value) : '']
      );
    }

    await conn.commit();
    res.json({ success: true, message: 'Settings updated' });
  } catch (err) {
    await conn.rollback();
    console.error('Settings updateAll error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── UPLOAD CUSTOM UPI QR CODE ─────────────
exports.uploadQrCode = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file uploaded' });
    }

    const qrUrl = `/uploads/qr/${req.file.filename}`;
    const qrId = req.query.qr_id ? parseInt(req.query.qr_id, 10) : null;

    if (qrId) {
      await pool.query('UPDATE payment_qrs SET qr_image_url = ? WHERE id = ?', [qrUrl, qrId]);
    } else {
      // Update currently active QR or setting
      const [active] = await pool.query('SELECT id FROM payment_qrs WHERE is_active = 1 LIMIT 1');
      if (active.length) {
        await pool.query('UPDATE payment_qrs SET qr_image_url = ? WHERE id = ?', [qrUrl, active[0].id]);
      }
      await pool.query(
        'INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
        ['upi_qr_url', qrUrl, qrUrl]
      );
    }

    res.json({
      success: true,
      message: 'Payment QR Code uploaded successfully!',
      data: { upi_qr_url: qrUrl }
    });
  } catch (err) {
    console.error('Settings uploadQrCode error:', err);
    res.status(500).json({ success: false, error: 'Failed to upload QR Code' });
  }
};
