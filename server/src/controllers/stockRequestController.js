const pool = require('../config/db');

// List stock requests (Admin sees all or filtered by franchise, Franchise sees their own)
exports.list = async (req, res) => {
  try {
    const isGlobalAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    const activeFranchiseId = req.headers['x-franchise-id']
      ? parseInt(req.headers['x-franchise-id'], 10)
      : (req.user.franchise_id || 1);

    let sql = `
      SELECT r.*, 
             f.name AS franchise_name, 
             f.code AS franchise_code, 
             COALESCE(r.unit, i.unit, 'pcs') AS unit, 
             COALESCE(i.quantity, 0) AS main_stock,
             i.sku,
             i.category,
             (r.product_id IS NULL) AS is_custom,
             COALESCE(fp.franchise_price, i.franchise_price, i.selling_price, r.estimated_price, 0) AS unit_price,
             (r.requested_quantity * COALESCE(fp.franchise_price, i.franchise_price, i.selling_price, r.estimated_price, 0)) AS total_amount
      FROM franchise_stock_requests r
      LEFT JOIN franchises f ON r.franchise_id = f.id
      LEFT JOIN inventory i ON r.product_id = i.id
      LEFT JOIN franchise_inventory_pricing fp ON fp.inventory_id = i.id AND fp.franchise_id = r.franchise_id
    `;
    const params = [];

    if (!isGlobalAdmin) {
      sql += ' WHERE r.franchise_id = ?';
      params.push(activeFranchiseId);
    } else if (req.query.franchise_id) {
      sql += ' WHERE r.franchise_id = ?';
      params.push(parseInt(req.query.franchise_id, 10));
    }

    sql += ' ORDER BY r.id DESC';

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List stock requests error:', err.message);
    res.json({ success: true, data: [] });
  }
};

// Create stock request(s) (Supports catalog dropdown items & manual written custom items)
exports.create = async (req, res) => {
  try {
    const requested_quantity = req.body.requested_quantity || req.body.quantity_requested || req.body.quantity;
    const { product_id, product_name, unit, estimated_price, items, notes } = req.body;
    const activeFranchiseId = req.headers['x-franchise-id']
      ? parseInt(req.headers['x-franchise-id'], 10)
      : (req.body.franchise_id || req.user.franchise_id || 1);
    // The main studio (HQ) supplies the others; it never orders stock from itself.
    if (Number(activeFranchiseId) === 1) {
      return res.status(400).json({ success: false, error: 'The main studio does not order stock from itself. Add stock in Inventory instead.' });
    }

    let orderItems = [];
    if (Array.isArray(items) && items.length > 0) {
      orderItems = items;
    } else if (product_id || product_name) {
      orderItems = [{ product_id, product_name, requested_quantity, unit, estimated_price, notes }];
    } else {
      return res.status(400).json({ success: false, error: 'Valid product selection or manual product name required' });
    }

    const insertedIds = [];
    for (const item of orderItems) {
      const pId = item.product_id ? parseInt(item.product_id, 10) : null;
      const qty = parseInt(item.requested_quantity || item.quantity_requested || item.quantity, 10);
      let pName = item.product_name ? item.product_name.trim() : '';
      let pUnit = item.unit || 'pcs';
      let estPrice = item.estimated_price ? parseFloat(item.estimated_price) : null;

      if (!qty || qty <= 0) continue;

      if (pId) {
        const [products] = await pool.query('SELECT product_name, unit, selling_price, franchise_price FROM inventory WHERE id = ?', [pId]);
        if (products.length) {
          pName = products[0].product_name;
          pUnit = products[0].unit || pUnit;
          if (!estPrice) estPrice = products[0].franchise_price || products[0].selling_price || null;
        }
      }

      if (!pName) continue;

      const [result] = await pool.query(
        `INSERT INTO franchise_stock_requests (franchise_id, product_id, product_name, requested_quantity, unit, estimated_price, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [activeFranchiseId, pId, pName, qty, pUnit, estPrice, item.notes || notes || null]
      );
      insertedIds.push(result.insertId);
    }

    if (!insertedIds.length) {
      return res.status(400).json({ success: false, error: 'Failed to create stock requests. Please check your product input.' });
    }

    res.status(201).json({
      success: true,
      data: { count: insertedIds.length, ids: insertedIds, id: insertedIds[0] },
      message: `Successfully submitted ${insertedIds.length} stock replenishment request(s) to Admin.`
    });
  } catch (err) {
    console.error('Create stock request error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Approve stock request (Admin flow - Only Main Studio Admin)
exports.approve = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const isGlobalAdmin = (req.user.role === 'admin' || req.user.role === 'super_admin') && (!req.user.franchise_id || req.user.franchise_id === 1);

    if (!isGlobalAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Only Main Studio Admin can approve or reject stock transfer requests.'
      });
    }

    const { id } = req.params;
    const customQty = req.body.approved_quantity ? parseInt(req.body.approved_quantity, 10) : null;

    await conn.beginTransaction();

    const [requests] = await conn.query('SELECT * FROM franchise_stock_requests WHERE id = ? AND status = "pending"', [id]);
    if (!requests.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Pending stock request not found' });
    }

    const reqItem = requests[0];
    const transferQty = (customQty && customQty > 0) ? customQty : reqItem.requested_quantity;

    if (reqItem.product_id) {
      // 1. Catalog product transfer
      const [invRows] = await conn.query('SELECT * FROM inventory WHERE id = ?', [reqItem.product_id]);
      if (!invRows.length) {
        await conn.rollback();
        return res.status(404).json({ success: false, error: 'Product not found in main inventory' });
      }

      const mainItem = invRows[0];
      if (Number(mainItem.franchise_id || 1) === Number(reqItem.franchise_id || 1)) {
        await conn.rollback();
        return res.status(400).json({ success: false, error: 'This request is from the same studio that holds the stock — nothing to send' });
      }
      const sErr = await require('../utils/stock').stockError(conn, reqItem.product_id, transferQty);
      if (sErr) { await conn.rollback(); return res.status(400).json({ success: false, error: sErr }); }

      // Deduct stock from main admin inventory
      await conn.query('UPDATE inventory SET quantity = GREATEST(0, quantity - ?) WHERE id = ?', [transferQty, reqItem.product_id]);

      // Check if product already exists in target franchise inventory
      const [franchiseInv] = await conn.query(
        'SELECT id FROM inventory WHERE (product_name = ? OR (sku IS NOT NULL AND sku = ?)) AND franchise_id = ? AND is_deleted = 0',
        [reqItem.product_name, mainItem.sku || '', reqItem.franchise_id]
      );

      if (franchiseInv.length) {
        await conn.query(
          'UPDATE inventory SET quantity = quantity + ? WHERE id = ?',
          [transferQty, franchiseInv[0].id]
        );
      } else {
        // Fetch custom franchise price override if present
        let fSellingPrice = mainItem.selling_price;
        let fFranchisePrice = mainItem.franchise_price;
        const [fpRows] = await conn.query(
          'SELECT franchise_price, selling_price FROM franchise_inventory_pricing WHERE inventory_id = ? AND franchise_id = ?',
          [reqItem.product_id, reqItem.franchise_id]
        );
        if (fpRows.length) {
          if (fpRows[0].franchise_price !== null) fFranchisePrice = fpRows[0].franchise_price;
          if (fpRows[0].selling_price !== null) fSellingPrice = fpRows[0].selling_price;
        }

        // Create new inventory row for target franchise
        await conn.query(
          `INSERT INTO inventory (
            product_name, unit, quantity, low_stock_threshold,
            sku, category, cost_price, selling_price, franchise_price, staff_price, franchise_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            mainItem.product_name, mainItem.unit, transferQty, mainItem.low_stock_threshold || 5,
            mainItem.sku, mainItem.category, mainItem.cost_price, fSellingPrice, fFranchisePrice, mainItem.staff_price, reqItem.franchise_id
          ]
        );
      }
    } else {
      // 2. Manual written custom product approval
      // Check if main admin has a matching item by product_name
      const [mainMatch] = await conn.query(
        'SELECT id FROM inventory WHERE LOWER(product_name) = LOWER(?) AND (franchise_id = 1 OR franchise_id IS NULL) AND is_deleted = 0',
        [reqItem.product_name.trim()]
      );

      if (mainMatch.length) {
        await conn.query('UPDATE inventory SET quantity = GREATEST(0, quantity - ?) WHERE id = ?', [transferQty, mainMatch[0].id]);
      }

      const [franchiseInv] = await conn.query(
        'SELECT id FROM inventory WHERE LOWER(product_name) = LOWER(?) AND franchise_id = ? AND is_deleted = 0',
        [reqItem.product_name.trim(), reqItem.franchise_id]
      );

      if (franchiseInv.length) {
        await conn.query(
          'UPDATE inventory SET quantity = quantity + ? WHERE id = ?',
          [transferQty, franchiseInv[0].id]
        );
      } else {
        // Create brand-new inventory row for franchise from custom request
        await conn.query(
          `INSERT INTO inventory (
            product_name, unit, quantity, low_stock_threshold,
            cost_price, selling_price, franchise_price, staff_price, franchise_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            reqItem.product_name.trim(), reqItem.unit || 'pcs', transferQty, 5,
            reqItem.estimated_price || 0, reqItem.estimated_price || 0, reqItem.estimated_price || 0, reqItem.estimated_price || 0, reqItem.franchise_id
          ]
        );
      }
    }

    // Mark request as approved
    await conn.query(
      'UPDATE franchise_stock_requests SET status = "approved", approved_at = NOW(), requested_quantity = ? WHERE id = ?',
      [transferQty, id]
    );

    await conn.commit();
    res.json({ success: true, message: `Approved stock request #${id}. ${transferQty} ${reqItem.unit || 'units'} transferred to Franchise inventory.` });
  } catch (err) {
    await conn.rollback();
    console.error('Approve stock request error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// Reject stock request (Admin flow - Only Main Studio Admin)
exports.reject = async (req, res) => {
  try {
    const isGlobalAdmin = (req.user.role === 'admin' || req.user.role === 'super_admin') && (!req.user.franchise_id || req.user.franchise_id === 1);

    if (!isGlobalAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Only Main Studio Admin can approve or reject stock transfer requests.'
      });
    }

    const { id } = req.params;
    const { reason } = req.body;

    const [requests] = await pool.query('SELECT id FROM franchise_stock_requests WHERE id = ? AND status = "pending"', [id]);
    if (!requests.length) {
      return res.status(404).json({ success: false, error: 'Pending stock request not found' });
    }

    await pool.query(
      'UPDATE franchise_stock_requests SET status = "rejected", rejection_reason = ? WHERE id = ?',
      [reason || 'Stock unavailable at main warehouse', id]
    );

    res.json({ success: true, message: `Stock request #${id} rejected.` });
  } catch (err) {
    console.error('Reject stock request error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
