const pool = require('../config/db');

/** What the customer pays for one unit: the listed price less the admin's discount %, to the rupee. */
const salePrice = (prod) => {
  const list = parseFloat(prod.selling_price) || 0;
  const pct = Math.min(Math.max(parseFloat(prod.discount_pct) || 0, 0), 100);
  return Math.round(list * (100 - pct)) / 100;
};
/** Staff / manager pay the staff price when the admin set one; everyone else the customer price. */
const buyerPrice = (prod, user) => (['staff', 'manager'].includes(user?.role) && parseFloat(prod.staff_price) > 0)
  ? Math.round(parseFloat(prod.staff_price) * 100) / 100 : salePrice(prod);

// ─── LIST ORDERS (ADMIN) ───────────────────────────
exports.listOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = '1=1';
    const params = [];

    if (status) {
      where += ' AND po.payment_status = ?';
      params.push(status);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM product_orders po WHERE ${where}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT po.*, 
              u.name AS customer_name, u.mobile AS customer_mobile, u.email AS customer_email,
              i.product_name, i.sku, i.category
       FROM product_orders po
       LEFT JOIN users u ON po.customer_id = u.id
       LEFT JOIN inventory i ON po.product_id = i.id
       WHERE ${where}
       ORDER BY po.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countRows[0].total
      }
    });
  } catch (err) {
    console.error('listOrders error:', err.message);
    res.json({
      success: true,
      data: [],
      pagination: {
        page: 1,
        limit: 50,
        total: 0
      }
    });
  }
};

// ─── LIST MY ORDERS (CUSTOMER) ───────────────────────
exports.listMyOrders = async (req, res) => {
  try {
    const customerId = req.user.id;
    const [rows] = await pool.query(
      `SELECT po.*, i.product_name, i.sku, i.category
       FROM product_orders po
       JOIN inventory i ON po.product_id = i.id
       WHERE po.customer_id = ?
       ORDER BY po.created_at DESC`,
      [customerId]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('listMyOrders error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CREATE ORDER ──────────────────────────────────
exports.createOrder = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { product_id, quantity = 1, cart_items, shipping_address, payment_method, qr_transaction_id } = req.body;
    const customerId = req.user.id;

    if ((!product_id && (!cart_items || !cart_items.length)) || !payment_method) {
      return res.status(400).json({ success: false, error: 'Product ID or cart items and payment method are required' });
    }

    if (!['qr', 'cash'].includes(payment_method)) {
      return res.status(400).json({ success: false, error: 'Invalid payment method' });
    }

    await conn.beginTransaction();

    let totalAmount = 0;
    let itemsSummary = [];
    let primaryProductId = product_id || null;
    let primaryQuantity = quantity || 1;

    if (cart_items && Array.isArray(cart_items) && cart_items.length > 0) {
      primaryProductId = cart_items[0].product_id || cart_items[0].id;
      for (const item of cart_items) {
        const pid = item.product_id || item.id;
        const q = parseInt(item.quantity) || 1;
        const [products] = await conn.query(
          `SELECT i.id, i.product_name, COALESCE(fp.selling_price, i.selling_price) AS selling_price, i.discount_pct, i.quantity, i.staff_price
           FROM inventory i LEFT JOIN franchise_inventory_pricing fp ON fp.inventory_id = i.id AND fp.franchise_id = ?
           WHERE i.id = ? AND i.is_deleted = 0`,
          [Number(req.franchiseId || req.user?.franchise_id || 1), pid]
        );
        if (!products.length) {
          await conn.rollback();
          return res.status(404).json({ success: false, error: `Product #${pid} not found` });
        }
        const prod = products[0];
        if (parseFloat(prod.quantity) < q) {
          await conn.rollback();
          return res.status(400).json({ success: false, error: `Insufficient stock for "${prod.product_name}"` });
        }
        const uPrice = buyerPrice(prod, req.user);
        const iTotal = uPrice * q;
        totalAmount += iTotal;
        itemsSummary.push({
          product_id: pid,
          product_name: prod.product_name,
          quantity: q,
          unit_price: uPrice,
          total_price: iTotal
        });
      }
    } else {
      // Single product backward compatibility
      const [products] = await conn.query(
        `SELECT i.id, i.product_name, COALESCE(fp.selling_price, i.selling_price) AS selling_price, i.discount_pct, i.quantity, i.staff_price
           FROM inventory i LEFT JOIN franchise_inventory_pricing fp ON fp.inventory_id = i.id AND fp.franchise_id = ?
           WHERE i.id = ? AND i.is_deleted = 0`,
        [Number(req.franchiseId || req.user?.franchise_id || 1), product_id]
      );
      if (!products.length) {
        await conn.rollback();
        return res.status(404).json({ success: false, error: 'Product not found' });
      }
      const prod = products[0];
      const uPrice = buyerPrice(prod, req.user);
      totalAmount = uPrice * quantity;
      if (parseFloat(prod.quantity) < quantity) {
        await conn.rollback();
        return res.status(400).json({ success: false, error: 'Insufficient stock available' });
      }
      itemsSummary.push({
        product_id: prod.id,
        product_name: prod.product_name,
        quantity: quantity,
        unit_price: uPrice,
        total_price: totalAmount
      });
    }

    const itemsJsonStr = JSON.stringify(itemsSummary);
    const unitPrice = itemsSummary.length > 0 ? itemsSummary[0].unit_price : 0;
    let orderId = null;

    if (payment_method === 'cash') {
      // Pay at the studio when collecting — the studio confirms the order, then marks it paid
      const [oResult] = await conn.query(
        `INSERT INTO product_orders
         (customer_id, product_id, quantity, unit_price, total_amount, payment_method, payment_status, items_json, shipping_address, franchise_id)
         VALUES (?, ?, ?, ?, ?, 'cash', 'pending', ?, ?, ?)`,
        [customerId, primaryProductId, primaryQuantity, unitPrice, totalAmount, itemsJsonStr, shipping_address || 'Collect at studio', (Number(req.franchiseId) || Number(req.user?.franchise_id) || 1)]
      );
      orderId = oResult.insertId;
      await conn.query(
        `INSERT INTO v2_payments (customer_id, product_id, amount, payment_method, status, notes)
         VALUES (?, ?, ?, 'cash', 'pending', ?)`,
        [customerId, primaryProductId, totalAmount, JSON.stringify({ product_order_id: orderId, items: itemsSummary, pay_at_studio: true })]
      );
      await conn.commit();
      return res.json({ success: true, order_id: orderId, payment_method: 'cash', total_amount: totalAmount,
        message: 'Order placed — collect and pay at the studio' });
    } else {
      // QR payment confirmation
      if (!qr_transaction_id) {
        await conn.rollback();
        return res.status(400).json({ success: false, error: 'QR Transaction ID is required for QR payments' });
      }

      // Insert product order as pending
      const [oResult] = await conn.query(
        `INSERT INTO product_orders 
         (customer_id, product_id, quantity, unit_price, total_amount, payment_method, payment_status, qr_transaction_id, items_json, shipping_address, franchise_id)
         VALUES (?, ?, ?, ?, ?, 'qr', 'pending', ?, ?, ?, ?)`,
        [customerId, primaryProductId, primaryQuantity, unitPrice, totalAmount, qr_transaction_id, itemsJsonStr, shipping_address || null, (Number(req.franchiseId) || Number(req.user?.franchise_id) || 1)]
      );
      orderId = oResult.insertId;

      // Insert into v2_payments
      await conn.query(
        `INSERT INTO v2_payments 
         (customer_id, product_id, amount, payment_method, status, notes)
         VALUES (?, ?, ?, 'qr', 'pending', ?)`,
        [customerId, primaryProductId, totalAmount, JSON.stringify({ product_order_id: orderId, quantity, qr_transaction_id })]
      );

      await conn.commit();
      return res.json({
        success: true,
        order_id: orderId,
        payment_method: 'qr',
        message: 'QR Payment order created and pending verification'
      });
    }

  } catch (err) {
    await conn.rollback();
    console.error('createOrder error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── CONFIRM PRODUCT ORDER (ADMIN) ───────────────────────
exports.confirmQrOrder = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;

    await conn.beginTransaction();

    const [orders] = await conn.query(
      'SELECT * FROM product_orders WHERE id = ? AND payment_status = ? FOR UPDATE',
      [id, 'pending']
    );

    if (!orders.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Pending product order not found' });
    }

    const order = orders[0];
    let cartItems = [];
    if (order.items_json) {
      try {
        cartItems = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : order.items_json;
      } catch {
        cartItems = [];
      }
    }

    // If multi-item order
    if (cartItems.length > 0) {
      // 1. Verify stock for all items
      for (const item of cartItems) {
        const pid = item.product_id || item.id;
        const q = parseInt(item.quantity) || 1;
        const [products] = await conn.query('SELECT quantity, product_name FROM inventory WHERE id = ?', [pid]);
        if (!products.length) {
          console.warn(`Product #${pid} not found in inventory during confirmation`);
          continue;
        }
        if (parseFloat(products[0].quantity) < q) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            error: `Insufficient stock for "${products[0]?.product_name || `Product #${pid}`}" (Available: ${products[0].quantity})`
          });
        }
      }

      // 2. Update order status to completed
      await conn.query(`UPDATE product_orders SET payment_status = 'completed' WHERE id = ?`, [id]);
      // Accounts: shop sale revenue (its Payments row already exists)
      await require('../services/moneyIn').recordMoneyIn(conn, { amount: order.total_amount, type: 'product_sale', refId: Number(id), skipPayment: true,
        note: `Shop order #${id}`, franchiseId: order.franchise_id || 1, userId: req.user.id });

      // 3. Deduct stock & log buy_sell B2C for each item
      for (const item of cartItems) {
        const pid = item.product_id || item.id;
        const q = parseInt(item.quantity) || 1;
        const uPrice = parseFloat(item.unit_price) || 0;
        const tPrice = parseFloat(item.total_price) || (uPrice * q);

        await conn.query('UPDATE inventory SET quantity = GREATEST(0, quantity - ?) WHERE id = ?', [q, pid]);

        try {
          await conn.query(
            `INSERT INTO buy_sell (type, party_name, party_mobile, product_id, product_name, quantity, unit_price, total_amount, note, status, transaction_date, created_by, franchise_id)
             SELECT 'sell_b2c', u.name, u.mobile, i.id, i.product_name, ?, ?, ?, 'B2C product purchase (Cart Approved by Admin)', 'complete', CURDATE(), ?, COALESCE(u.franchise_id, 1)
             FROM users u, inventory i
             WHERE u.id = ? AND i.id = ?`,
            [q, uPrice, tPrice, req.user.id || 1, order.customer_id, pid]
          );
        } catch (bsErr) {
          console.warn('buy_sell logging warning:', bsErr.message);
        }
      }

    } else {
      // Single product backward compatibility
      if (order.product_id) {
        const [products] = await conn.query('SELECT quantity, product_name FROM inventory WHERE id = ?', [order.product_id]);
        if (products.length && parseFloat(products[0].quantity) < order.quantity) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            error: `Insufficient stock for "${products[0].product_name}" (Available: ${products[0].quantity})`
          });
        }
      }

      await conn.query(`UPDATE product_orders SET payment_status = 'completed' WHERE id = ?`, [id]);

      if (order.product_id) {
        await conn.query('UPDATE inventory SET quantity = GREATEST(0, quantity - ?) WHERE id = ?', [order.quantity, order.product_id]);

        try {
          await conn.query(
            `INSERT INTO buy_sell (type, party_name, party_mobile, product_id, product_name, quantity, unit_price, total_amount, note, status, transaction_date, created_by, franchise_id)
             SELECT 'sell_b2c', u.name, u.mobile, i.id, i.product_name, ?, ?, ?, 'B2C product purchase (Approved by Admin)', 'complete', CURDATE(), ?, COALESCE(u.franchise_id, 1)
             FROM users u, inventory i
             WHERE u.id = ? AND i.id = ?`,
            [order.quantity, order.unit_price, order.total_amount, req.user.id || 1, order.customer_id, order.product_id]
          );
        } catch (bsErr) {
          console.warn('buy_sell logging warning:', bsErr.message);
        }
      }
    }

    // Update v2_payments status to captured if present
    try {
      await conn.query(
        // only this order's payment (other pending payments of the customer are unrelated)
        `UPDATE v2_payments SET status = 'captured' WHERE customer_id = ? AND status = 'pending'
           AND JSON_VALID(notes) AND JSON_UNQUOTE(JSON_EXTRACT(notes, '$.product_order_id')) = ?`,
        [order.customer_id, String(id)]
      );
    } catch (payErr) {
      console.warn('v2_payments update warning:', payErr.message);
    }

    await conn.commit();
    res.json({ success: true, message: 'Product order approved, payment completed, and inventory stock updated successfully' });

  } catch (err) {
    await conn.rollback();
    console.error('confirmQrOrder error:', err);
    res.status(500).json({ success: false, error: err.message || 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── REJECT PRODUCT ORDER (ADMIN) ───────────────────────
// POST /products/orders/:id/collected — customer picked up a paid order at the studio
exports.markCollected = async (req, res) => {
  try {
    const [r] = await pool.query(
      "UPDATE product_orders SET collected_at = NOW() WHERE id = ? AND payment_status = 'completed' AND collected_at IS NULL", [req.params.id]);
    if (!r.affectedRows) return res.status(400).json({ success: false, error: 'Only an approved order that is not collected yet can be marked collected' });
    res.json({ success: true, message: 'Order marked collected & paid' });
  } catch (err) {
    console.error('markCollected error:', err.message);
    res.status(500).json({ success: false, error: 'Could not mark collected' });
  }
};

exports.rejectOrder = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { reason = 'UPI payment reference not received in Studio account' } = req.body;

    await conn.beginTransaction();

    const [orders] = await conn.query(
      'SELECT * FROM product_orders WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!orders.length || (req.user.role !== 'super_admin' && Number(orders[0].franchise_id || 1) !== (Number(req.franchiseId) || Number(req.user.franchise_id) || 1))) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Product order not found' });
    }
    if (orders[0].payment_status !== 'pending') {
      await conn.rollback();
      return res.status(409).json({ success: false, error: orders[0].payment_status === 'completed'
        ? 'This order is already paid' + (orders[0].collected_at ? ' and collected' : '') + '. Use a refund in Payments instead.'
        : `This order is already ${orders[0].payment_status}` });
    }

    // Update product_orders status to failed
    try {
      await conn.query(
        `UPDATE product_orders SET payment_status = 'failed', notes = ? WHERE id = ?`,
        [reason, id]
      );
    } catch (colErr) {
      // Fallback if notes column error
      await conn.query(
        `UPDATE product_orders SET payment_status = 'failed' WHERE id = ?`,
        [id]
      );
    }

    await conn.commit();
    res.json({ success: true, message: 'Order rejected. Customer payment verification marked as failed.' });
  } catch (err) {
    await conn.rollback();
    console.error('rejectOrder error:', err);
    res.status(500).json({ success: false, error: err.message || 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── LIST CUSTOMER PRODUCTS ────────────────────────
exports.listCustomerProducts = async (req, res) => {
  try {
    // This studio's own customer price wins over the head-office price; then only the
    // price fields this role may see (Super Admin → Prices) are sent.
    const fid = Number(req.franchiseId || req.user?.franchise_id || 1);
    const [rows] = await pool.query(
      `SELECT i.*, fp.selling_price AS studio_selling_price, fp.franchise_price AS studio_franchise_price
       FROM inventory i
       LEFT JOIN franchise_inventory_pricing fp ON fp.inventory_id = i.id AND fp.franchise_id = ?
       WHERE i.is_deleted = 0 AND COALESCE(i.category, '') <> 'Studio Materials'  -- studio supplies are not for sale
       ORDER BY i.product_name ASC, i.id DESC`, [fid]);
    const { applyPriceVisibility } = require('../services/priceVisibility');
    const role = req.user?.role || 'customer';
    const data = [];
    for (const r of rows) {
      const { studio_selling_price, studio_franchise_price, ...item } = r;
      if (studio_selling_price != null) item.selling_price = studio_selling_price;
      if (studio_franchise_price != null) item.franchise_price = studio_franchise_price;
      data.push(await applyPriceVisibility(item, role));
    }
    res.json({ success: true, data });
  } catch (err) {
    console.error('listCustomerProducts error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.buyerPrice = buyerPrice;
