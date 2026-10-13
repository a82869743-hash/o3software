const pool = require('../config/db');
const crypto = require('crypto');
const Razorpay = require('razorpay');

let razorpayInstance = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
}

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

    if (!['razorpay', 'qr'].includes(payment_method)) {
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
          'SELECT id, product_name, selling_price, quantity FROM inventory WHERE id = ? AND is_deleted = 0',
          [pid]
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
        const uPrice = parseFloat(prod.selling_price) || 0;
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
        'SELECT id, product_name, selling_price, quantity FROM inventory WHERE id = ? AND is_deleted = 0',
        [product_id]
      );
      if (!products.length) {
        await conn.rollback();
        return res.status(404).json({ success: false, error: 'Product not found' });
      }
      const prod = products[0];
      const uPrice = parseFloat(prod.selling_price) || 0;
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
    let razorpayOrder = null;
    let orderId = null;

    if (payment_method === 'razorpay') {
      const calculatedAmount = Math.round(totalAmount * 100); // in paise
      if (razorpayInstance) {
        const options = {
          amount: calculatedAmount,
          currency: 'INR',
          receipt: `prod_order_${Date.now()}`
        };
        razorpayOrder = await razorpayInstance.orders.create(options);
      } else {
        console.warn('[RAZORPAY MOCK MODE] Creating simulated order for product purchase');
        razorpayOrder = {
          id: `order_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          amount: calculatedAmount,
          currency: 'INR',
          receipt: `prod_order_mock_${Date.now()}`
        };
      }

      // Insert product order as pending
      const [oResult] = await conn.query(
        `INSERT INTO product_orders 
         (customer_id, product_id, quantity, unit_price, total_amount, payment_method, payment_status, razorpay_order_id, items_json, shipping_address)
         VALUES (?, ?, ?, ?, ?, 'razorpay', 'pending', ?, ?, ?)`,
        [customerId, primaryProductId, primaryQuantity, unitPrice, totalAmount, razorpayOrder.id, itemsJsonStr, shipping_address || null]
      );
      orderId = oResult.insertId;

      // Insert into v2_payments
      await conn.query(
        `INSERT INTO v2_payments 
         (customer_id, product_id, amount, payment_method, status, razorpay_order_id, notes)
         VALUES (?, ?, ?, 'razorpay', 'pending', ?, ?)`,
        [customerId, primaryProductId, totalAmount, razorpayOrder.id, JSON.stringify({ product_order_id: orderId, items: itemsSummary })]
      );

      await conn.commit();
      return res.json({
        success: true,
        order_id: orderId,
        payment_method: 'razorpay',
        razorpay_order: razorpayOrder
      });

    } else {
      // QR payment confirmation
      if (!qr_transaction_id) {
        await conn.rollback();
        return res.status(400).json({ success: false, error: 'QR Transaction ID is required for QR payments' });
      }

      // Insert product order as pending
      const [oResult] = await conn.query(
        `INSERT INTO product_orders 
         (customer_id, product_id, quantity, unit_price, total_amount, payment_method, payment_status, qr_transaction_id, items_json, shipping_address)
         VALUES (?, ?, ?, ?, ?, 'qr', 'pending', ?, ?, ?)`,
        [customerId, primaryProductId, primaryQuantity, unitPrice, totalAmount, qr_transaction_id, itemsJsonStr, shipping_address || null]
      );
      orderId = oResult.insertId;

      // Insert into v2_payments
      await conn.query(
        `INSERT INTO v2_payments 
         (customer_id, product_id, amount, payment_method, status, notes)
         VALUES (?, ?, ?, 'qr', 'pending', ?)`,
        [customerId, product_id, totalAmount, JSON.stringify({ product_order_id: orderId, quantity, qr_transaction_id })]
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

// ─── VERIFY RAZORPAY PAYMENT ────────────────────────
exports.verifyPayment = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, error: 'Missing payment details' });
    }

    await conn.beginTransaction();

    // Fetch the pending order
    const [orders] = await conn.query(
      'SELECT * FROM product_orders WHERE razorpay_order_id = ? AND payment_status = ? FOR UPDATE',
      [razorpay_order_id, 'pending']
    );

    if (!orders.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Order not found or already verified' });
    }

    const order = orders[0];

    // Verification check
    let signatureIsValid = false;
    if (razorpay_order_id.startsWith('order_mock_') || !razorpayInstance) {
      signatureIsValid = true;
    } else {
      const body = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');
      signatureIsValid = (expectedSignature === razorpay_signature);
    }

    if (!signatureIsValid) {
      // Mark order as failed
      await conn.query('UPDATE product_orders SET payment_status = ? WHERE id = ?', ['failed', order.id]);
      await conn.query('UPDATE v2_payments SET status = ? WHERE razorpay_order_id = ?', ['failed', razorpay_order_id]);
      await conn.commit();
      return res.status(400).json({ success: false, error: 'Invalid payment signature' });
    }

    // Update order status to completed
    await conn.query(
      `UPDATE product_orders 
       SET payment_status = 'completed', razorpay_payment_id = ?, razorpay_signature = ? 
       WHERE id = ?`,
      [razorpay_payment_id, razorpay_signature, order.id]
    );

    // Update v2_payments
    await conn.query(
      `UPDATE v2_payments 
       SET status = 'captured', razorpay_payment_id = ?, razorpay_signature = ? 
       WHERE razorpay_order_id = ?`,
      [razorpay_payment_id, razorpay_signature, razorpay_order_id]
    );

    // Get the payment ID for transaction log
    const [payments] = await conn.query('SELECT id FROM v2_payments WHERE razorpay_order_id = ?', [razorpay_order_id]);
    if (payments.length) {
      await conn.query(
        `INSERT INTO v2_payment_transactions 
         (payment_id, transaction_type, amount, status) 
         VALUES (?, 'credit', ?, 'success')`,
        [payments[0].id, order.total_amount]
      );
    }

    // Deduct stock quantity in inventory
    await conn.query(
      'UPDATE inventory SET quantity = quantity - ? WHERE id = ?',
      [order.quantity, order.product_id]
    );

    // Log Buy & Sell record as complete
    await conn.query(
      `INSERT INTO buy_sell (type, party_name, party_mobile, product_id, product_name, quantity, unit_price, total_amount, note, status, transaction_date, created_by)
       SELECT 'sell_b2c', u.name, u.mobile, i.id, i.product_name, ?, ?, ?, 'B2C product purchase via customer portal (Razorpay)', 'complete', CURDATE(), u.id
       FROM users u, inventory i
       WHERE u.id = ? AND i.id = ?`,
      [order.quantity, order.unit_price, order.total_amount, order.customer_id, order.product_id]
    );

    await conn.commit();
    res.json({ success: true, message: 'Payment verified and order completed' });

  } catch (err) {
    await conn.rollback();
    console.error('verifyPayment error:', err);
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

      // 3. Deduct stock & log buy_sell B2C for each item
      for (const item of cartItems) {
        const pid = item.product_id || item.id;
        const q = parseInt(item.quantity) || 1;
        const uPrice = parseFloat(item.unit_price) || 0;
        const tPrice = parseFloat(item.total_price) || (uPrice * q);

        await conn.query('UPDATE inventory SET quantity = GREATEST(0, quantity - ?) WHERE id = ?', [q, pid]);

        try {
          await conn.query(
            `INSERT INTO buy_sell (type, party_name, party_mobile, product_id, product_name, quantity, unit_price, total_amount, note, status, transaction_date, created_by)
             SELECT 'sell_b2c', u.name, u.mobile, i.id, i.product_name, ?, ?, ?, 'B2C product purchase (Cart Approved by Admin)', 'complete', CURDATE(), ?
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
            `INSERT INTO buy_sell (type, party_name, party_mobile, product_id, product_name, quantity, unit_price, total_amount, note, status, transaction_date, created_by)
             SELECT 'sell_b2c', u.name, u.mobile, i.id, i.product_name, ?, ?, ?, 'B2C product purchase (Approved by Admin)', 'complete', CURDATE(), ?
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
        `UPDATE v2_payments SET status = 'captured' WHERE customer_id = ? AND status = 'pending'`,
        [order.customer_id]
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

    if (!orders.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Product order not found' });
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
    const [rows] = await pool.query(
      `SELECT * FROM inventory WHERE is_deleted = 0 ORDER BY product_name ASC, id DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('listCustomerProducts error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
