const pool = require('../config/db');
const { guessCarCategory } = require('../utils/carCategory');

// Get all unique brands (makes)
exports.getBrands = async (req, res) => {
  try {
    const query = 'SELECT DISTINCT make FROM vehicle_master ORDER BY make ASC';
    const [rows] = await pool.query(query);
    res.json({ success: true, data: rows.map(r => r.make).filter(Boolean) });
  } catch (error) {
    console.error('Error fetching brands:', error);
    res.status(500).json({ error: 'Server error fetching brands' });
  }
};

// Get models for a specific brand
exports.getModels = async (req, res) => {
  try {
    const { brand } = req.query;
    if (!brand) return res.status(400).json({ error: 'Brand query parameter required' });

    const query = 'SELECT DISTINCT model FROM vehicle_master WHERE make = ? ORDER BY model ASC';
    const [rows] = await pool.query(query, [brand]);
    res.json({ success: true, data: rows.map(r => r.model).filter(Boolean) });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Server error fetching models' });
  }
};

// Get variants for a specific brand and model
exports.getVariants = async (req, res) => {
  try {
    const { brand, model } = req.query;
    if (!brand || !model) return res.status(400).json({ error: 'Brand and model query parameters required' });

    const query = 'SELECT DISTINCT variant FROM vehicle_master WHERE make = ? AND model = ? ORDER BY variant ASC';
    const [rows] = await pool.query(query, [brand, model]);
    res.json({ success: true, data: rows.map(r => r.variant).filter(Boolean) });
  } catch (error) {
    console.error('Error fetching variants:', error);
    res.status(500).json({ error: 'Server error fetching variants' });
  }
};

// Get logged-in user's vehicles
exports.getVehicles = async (req, res) => {
  try {
    const userId = req.user.id;
    const userMobile = req.user.mobile || '';

    // First auto-attach any orphan vehicles registered with this user's mobile or email
    if (userMobile) {
      await pool.query(
        `UPDATE vehicles v 
         JOIN users u ON u.id = ? 
         SET v.customer_id = u.id 
         WHERE (v.customer_id IS NULL OR v.customer_id = 0) 
           AND (u.mobile = ? OR u.mobile LIKE CONCAT('%', ?))`,
        [userId, userMobile, userMobile.slice(-10)]
      );
    }

    const query = `
      SELECT v.* 
      FROM vehicles v
      WHERE v.customer_id = ?
      ORDER BY v.is_primary DESC, v.created_at DESC
    `;
    const [vehicles] = await pool.query(query, [userId]);
    
    res.json({ success: true, data: vehicles });
  } catch (error) {
    console.error('Error fetching user vehicles:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch vehicles' });
  }
};

// ─── GET ALL VEHICLES (Admin) ───────────────────────────────
// Returns all vehicles with customer info — for admin job card vehicle dropdown
exports.getAllVehicles = async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = '1=1';
    const params = [];

    if (search) {
      where += ' AND (v.registration_no LIKE ? OR v.brand LIKE ? OR v.model LIKE ? OR u.name LIKE ? OR u.mobile LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }

    const [rows] = await pool.query(`
      SELECT v.*, u.name AS customer_name, u.mobile AS customer_mobile, u.email AS customer_email
      FROM vehicles v
      JOIN users u ON v.customer_id = u.id
      WHERE ${where}
      ORDER BY v.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM vehicles v JOIN users u ON v.customer_id = u.id WHERE ${where}`,
      params
    );

    res.json({
      success: true,
      data: rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: countRows[0].total },
    });
  } catch (err) {
    console.error('getAllVehicles error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET VEHICLES BY CUSTOMER (Admin) ───────────────────────
exports.getByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const [vehicles] = await pool.query(
      'SELECT * FROM vehicles WHERE customer_id = ? ORDER BY is_primary DESC, created_at DESC',
      [customerId]
    );
    res.json({ success: true, data: vehicles });
  } catch (err) {
    console.error('getByCustomer error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── ADD CAR ────────────────────────────────────────────────
// POST /vehicles/add
// Body: { brand, model, registration_no?, car_year?, manufacture_year? }
// Automatically sets as primary if user has no other cars.
exports.addCar = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const userId = req.user.id;
    let { brand, model, registration_no, car_year, manufacture_year, category } = req.body;
    if (!registration_no || !String(registration_no).trim()) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Registration number is required' });
    }
    {
      const { validateRegNo } = require('../utils/validators');
      const rc = validateRegNo(registration_no);
      if (!rc.valid) { await conn.rollback(); return res.status(400).json({ success: false, error: rc.error }); }
      registration_no = rc.value;
      const [dupReg] = await pool.query('SELECT id FROM vehicles WHERE registration_no = ? AND id <> ?', [rc.value, Number(req.params.id) || 0]);
      if (dupReg.length) { await conn.rollback(); return res.status(409).json({ success: false, error: `${rc.value} is already registered to another customer. Please contact the studio.` }); }
    }
    const resolvedYear = car_year || manufacture_year || null;

    // Validate required fields
    if (!brand || !model) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        error: 'Brand and model are required',
      });
    }

    // Check how many cars the user has
    const [existing] = await conn.query(
      'SELECT COUNT(*) AS count FROM vehicles WHERE customer_id = ?',
      [userId]
    );
    const isFirst = existing[0].count === 0;

    // Insert new car — first car is automatically primary
    const [result] = await conn.query(
      `INSERT INTO vehicles (customer_id, brand, model, registration_no, car_year, is_primary, category)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, brand.trim(), model.trim(), registration_no?.toUpperCase().trim() || null, resolvedYear, isFirst ? 1 : 0, category || guessCarCategory(brand, model) || 'sedan']
    );

    await conn.commit();

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        brand: brand.trim(),
        model: model.trim(),
        registration_no: registration_no?.toUpperCase().trim() || null,
        car_year: resolvedYear,
        is_primary: isFirst ? 1 : 0,
        category: category || guessCarCategory(brand, model) || 'sedan',
      },
      message: 'Car added successfully',
    });
  } catch (err) {
    await conn.rollback();
    console.error('Add car error:', err);
    res.status(500).json({ success: false, error: 'Failed to add car' });
  } finally {
    conn.release();
  }
};

// ─── SET PRIMARY CAR ────────────────────────────────────────
// PATCH /vehicles/:id/primary
exports.setPrimary = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const userId = req.user.id;
    const carId = req.params.id;

    // Verify car belongs to user
    const [cars] = await conn.query(
      'SELECT id FROM vehicles WHERE id = ? AND customer_id = ?',
      [carId, userId]
    );
    if (!cars.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Car not found' });
    }

    // Unset all primary flags for this user
    await conn.query(
      'UPDATE vehicles SET is_primary = 0 WHERE customer_id = ?',
      [userId]
    );

    // Set the specified car as primary
    await conn.query(
      'UPDATE vehicles SET is_primary = 1 WHERE id = ?',
      [carId]
    );

    await conn.commit();
    res.json({ success: true, message: 'Primary car updated' });
  } catch (err) {
    await conn.rollback();
    console.error('Set primary error:', err);
    res.status(500).json({ success: false, error: 'Failed to update primary car' });
  } finally {
    conn.release();
  }
};

// ─── DELETE CAR ─────────────────────────────────────────────
// DELETE /vehicles/:id
exports.deleteCar = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const userId = req.user.id;
    const carId = req.params.id;

    // Verify car belongs to user
    const [cars] = await conn.query(
      'SELECT id, is_primary FROM vehicles WHERE id = ? AND customer_id = ?',
      [carId, userId]
    );
    if (!cars.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Car not found' });
    }

    // Check if car has active job carts
    const [activeJobs] = await conn.query(
      "SELECT COUNT(*) AS count FROM job_carts WHERE vehicle_id = ? AND status != 'complete'",
      [carId]
    );
    if (activeJobs[0].count > 0) {
      await conn.rollback();
      return res.status(422).json({
        success: false,
        error: 'Cannot delete a car with active job carts',
      });
    }

    // Check if car has active bookings
    const [activeBookings] = await conn.query(
      "SELECT COUNT(*) AS count FROM bookings WHERE vehicle_id = ? AND status IN ('pending_approval', 'confirmed', 'in_progress', 'pending_payment', 'reschedule_required')",
      [carId]
    );
    if (activeBookings[0].count > 0) {
      await conn.rollback();
      return res.status(422).json({
        success: false,
        error: `Cannot delete vehicle: It has ${activeBookings[0].count} active booking(s) attached to it. Please complete or cancel the booking(s) first.`,
      });
    }

    // A car with service history (job cards, packages, warranty, done washes) is kept — that record matters
    const [[hist]] = await conn.query(
      `SELECT (SELECT COUNT(*) FROM job_carts WHERE vehicle_id = ?)
            + (SELECT COUNT(*) FROM user_packages WHERE vehicle_id = ?)
            + (SELECT COUNT(*) FROM warranty_certificates WHERE vehicle_id = ?)
            + (SELECT COUNT(*) FROM bookings WHERE vehicle_id = ? AND status IN ('completed', 'delivered')) AS n`,
      [carId, carId, carId, carId]
    );
    if (Number(hist.n) > 0) {
      await conn.rollback();
      return res.status(422).json({
        success: false,
        error: 'This car has service history with us, so it can\'t be removed. Please ask the studio if you no longer own it.',
      });
    }

    const wasPrimary = cars[0].is_primary;

    // Delete the car
    await conn.query('DELETE FROM vehicles WHERE id = ?', [carId]);

    // If deleted car was primary, promote the next car
    if (wasPrimary) {
      await conn.query(
        'UPDATE vehicles SET is_primary = 1 WHERE customer_id = ? ORDER BY created_at ASC LIMIT 1',
        [userId]
      );
    }

    await conn.commit();
    res.json({ success: true, message: 'Car deleted successfully' });
  } catch (err) {
    await conn.rollback();
    console.error('Delete car error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete car' });
  } finally {
    conn.release();
  }
};

// ─── UPDATE CAR ─────────────────────────────────────────────
// PATCH /vehicles/:id
exports.updateCar = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const userId = req.user.id;
    const carId = req.params.id;
    let { brand, model, registration_no, car_year, manufacture_year, category } = req.body;
    if (registration_no) {
      const { validateRegNo } = require('../utils/validators');
      const rc = validateRegNo(registration_no);
      if (!rc.valid) return res.status(400).json({ success: false, error: rc.error });
      registration_no = rc.value;
      const [dupReg] = await pool.query('SELECT id FROM vehicles WHERE registration_no = ? AND id <> ?', [rc.value, Number(req.params.id) || 0]);
      if (dupReg.length) return res.status(409).json({ success: false, error: `${rc.value} is already registered to another customer. Please contact the studio.` });
    }
    const resolvedYear = car_year || manufacture_year || null;

    // Verify car exists
    const [cars] = await conn.query(
      'SELECT id, customer_id FROM vehicles WHERE id = ?',
      [carId]
    );
    if (!cars.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Car not found' });
    }

    // Check authorization: admin or owner
    if (!['admin', 'super_admin'].includes(req.user.role) && cars[0].customer_id !== userId) {
      await conn.rollback();
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    // Update details
    await conn.query(
      `UPDATE vehicles 
       SET brand = ?, model = ?, registration_no = ?, car_year = ?, category = ?
       WHERE id = ?`,
      [
        brand ? brand.trim() : null,
        model ? model.trim() : null,
        registration_no ? registration_no.toUpperCase().trim() : null,
        resolvedYear,
        category || 'sedan',
        carId
      ]
    );

    await conn.commit();
    res.json({
      success: true,
      message: 'Car updated successfully',
      data: {
        id: parseInt(carId),
        brand: brand?.trim() || null,
        model: model?.trim() || null,
        registration_no: registration_no?.toUpperCase().trim() || null,
        car_year: resolvedYear,
        category: category || 'sedan'
      }
    });
  } catch (err) {
    await conn.rollback();
    console.error('Update car error:', err);
    res.status(500).json({ success: false, error: 'Failed to update car' });
  } finally {
    conn.release();
  }
};

// ─── VEHICLE MASTER CRUD (ADMIN) ───────────────────────────
exports.getAllMaster = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM vehicle_master ORDER BY make ASC, model ASC');
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching vehicle master list:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch vehicle master entries' });
  }
};

exports.createMaster = async (req, res) => {
  try {
    const { make, model, variant } = req.body;
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Only an admin can change the car make / model list' });
    }
    if (!make || !model) {
      return res.status(400).json({ success: false, error: 'Make and model are required' });
    }
    const [[dupV]] = await pool.query(
      `SELECT id FROM vehicle_master WHERE LOWER(TRIM(make)) = LOWER(?) AND LOWER(TRIM(model)) = LOWER(?) AND LOWER(COALESCE(TRIM(variant), '')) = LOWER(?) LIMIT 1`,
      [make.trim(), model.trim(), variant?.trim() || '']);
    if (dupV) return res.status(409).json({ success: false, error: `"${make.trim()} ${model.trim()}${variant ? ' ' + variant.trim() : ''}" is already in the list` });
    const [result] = await pool.query(
      'INSERT INTO vehicle_master (make, model, variant) VALUES (?, ?, ?)',
      [make.trim(), model.trim(), variant?.trim() || null]
    );

    res.status(201).json({
      success: true,
      message: `Car Make/Model "${make} ${model}" created successfully`,
      data: { id: result.insertId, make: make.trim(), model: model.trim(), variant: variant?.trim() || null }
    });
  } catch (error) {
    console.error('Error creating vehicle master entry:', error);
    res.status(500).json({ success: false, error: 'Failed to create vehicle master entry' });
  }
};

exports.updateMaster = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { make, model, variant } = req.body;
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Only an admin can change the car make / model list' });
    }
    if (!make || !model) {
      return res.status(400).json({ success: false, error: 'Make and model are required' });
    }
    const [[dupU]] = await conn.query(
      `SELECT id FROM vehicle_master WHERE id <> ? AND LOWER(TRIM(make)) = LOWER(?) AND LOWER(TRIM(model)) = LOWER(?) AND LOWER(COALESCE(TRIM(variant), '')) = LOWER(?) LIMIT 1`,
      [id, make.trim(), model.trim(), variant?.trim() || '']);
    if (dupU) { return res.status(409).json({ success: false, error: 'That make / model is already in the list' }); }
    await conn.beginTransaction();

    const [existing] = await conn.query('SELECT * FROM vehicle_master WHERE id = ?', [id]);
    if (!existing.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Vehicle master entry not found' });
    }

    const oldMake = existing[0].make;
    const oldModel = existing[0].model;
    const newMake = make.trim();
    const newModel = model.trim();

    await conn.query(
      'UPDATE vehicle_master SET make = ?, model = ?, variant = ? WHERE id = ?',
      [newMake, newModel, variant?.trim() || null, id]
    );

    // Cascade rename to vehicles table if brand/model changed
    if (oldMake !== newMake || oldModel !== newModel) {
      await conn.query(
        'UPDATE vehicles SET brand = ?, model = ? WHERE brand = ? AND model = ?',
        [newMake, newModel, oldMake, oldModel]
      );
    }

    await conn.commit();
    res.json({ success: true, message: `Vehicle master "${newMake} ${newModel}" updated successfully` });
  } catch (error) {
    await conn.rollback();
    console.error('Error updating vehicle master entry:', error);
    res.status(500).json({ success: false, error: 'Failed to update vehicle master entry' });
  } finally {
    conn.release();
  }
};

exports.deleteMaster = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    await conn.beginTransaction();

    const [existing] = await conn.query('SELECT * FROM vehicle_master WHERE id = ?', [id]);
    if (!existing.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Vehicle master entry not found' });
    }

    const { make, model } = existing[0];

    const [inUse] = await conn.query(
      'SELECT COUNT(*) AS cnt FROM vehicles WHERE brand = ? AND model = ?',
      [make, model]
    );

    if (inUse[0].cnt > 0) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        error: `Cannot delete "${make} ${model}" because it is currently assigned to ${inUse[0].cnt} customer vehicle(s).`
      });
    }

    await conn.query('DELETE FROM vehicle_master WHERE id = ?', [id]);
    await conn.commit();
    res.json({ success: true, message: `Vehicle master entry "${make} ${model}" deleted successfully` });
  } catch (error) {
    await conn.rollback();
    console.error('Error deleting vehicle master entry:', error);
    res.status(500).json({ success: false, error: 'Failed to delete vehicle master entry' });
  } finally {
    conn.release();
  }
};
