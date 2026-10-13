const pool = require('../config/db');

// ─── CREATE MANUAL BILL ─────────────────────
exports.create = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const {
      customer_id, customer_name, customer_mobile,
      amount, description, services, products, items, payment_method = 'cash',
      discount_type, discount_value, gst_type, gst_pct, loyalty_redeemed,
      vehicle_brand, vehicle_model, vehicle_reg_no, vehicle_category,
      franchise_id, discount_reason, discount_reference
    } = req.body;

    // Compute subtotal from services, products, or generic items
    let calcSubtotal = 0;
    if (services && Array.isArray(services)) {
      services.forEach(s => { calcSubtotal += parseFloat(s.price || s.service_price || 0); });
    }
    if (products && Array.isArray(products)) {
      products.forEach(p => { calcSubtotal += (parseFloat(p.price || p.unit_cost || 0) * parseInt(p.quantity || 1)); });
    }
    if (items && Array.isArray(items)) {
      items.forEach(it => { calcSubtotal += (parseFloat(it.price || 0) * parseInt(it.quantity || 1)); });
    }
    if (calcSubtotal === 0 && amount > 0) {
      calcSubtotal = parseFloat(amount);
    }

    let numVal = parseFloat(discount_value || 0);
    if (isNaN(numVal) || numVal < 0) numVal = 0;
    if (discount_type === 'percentage' && numVal > 100) numVal = 100;

    if (numVal > 0) {
      if (!discount_reason || !discount_reason.trim() || !discount_reference || !discount_reference.trim()) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          error: 'Discount reason and approved/referred by reference are mandatory whenever a discount is applied'
        });
      }
    }

    let discountAmt = 0;
    if (discount_type === 'percentage') {
      discountAmt = calcSubtotal * (numVal / 100);
    } else if (discount_type === 'fixed') {
      discountAmt = Math.min(calcSubtotal, numVal);
    }
    discountAmt = Math.min(calcSubtotal, Math.max(0, discountAmt));
    const amountAfterDiscount = calcSubtotal - discountAmt;

    const isWithGst = gst_type === 'with_gst';
    const effectiveGstPct = isWithGst ? (parseFloat(gst_pct || 18.00)) : 0;
    const gstAmt = isWithGst ? (amountAfterDiscount * (effectiveGstPct / 100)) : 0;
    const grandTotalVal = Math.max(0, amountAfterDiscount + gstAmt);

    // Process products inventory deduction if present
    if (products && Array.isArray(products) && products.length > 0) {
      for (const prod of products) {
        if (prod.id && parseInt(prod.quantity || 1) > 0) {
          await conn.query('UPDATE inventory SET quantity = GREATEST(0, quantity - ?) WHERE id = ?', [parseInt(prod.quantity || 1), prod.id]);
        }
      }
    }

    // Deduct loyalty points if redeemed
    if (loyalty_redeemed && customer_id && discount_type === 'fixed' && discount_value > 0) {
      await conn.query('UPDATE loyalty SET credits = GREATEST(0, credits - ?) WHERE customer_id = ?', [discount_value, customer_id]);
      
      // Log the loyalty redemption transaction
      await conn.query(
        `INSERT INTO transactions (type, reference_id, amount, direction, note, transaction_date, created_by)
         VALUES ('loyalty_redeem', ?, ?, 'out', ?, CURDATE(), ?)`,
        [customer_id, discount_value, `Redeemed ₹${discount_value} for Manual Bill`, req.user.id]
      );
    }

    const [result] = await conn.query(
      `INSERT INTO manual_bills 
       (customer_id, customer_name, customer_mobile, amount, discount_type, discount_value, discount_amount, gst_type, gst_pct, gst_amount, subtotal, grand_total, description, services_json, products_json, payment_method, created_by,
        vehicle_brand, vehicle_model, vehicle_reg_no, vehicle_category, franchise_id, discount_reason, discount_reference)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customer_id || null,
        customer_name || null,
        customer_mobile || null,
        grandTotalVal,
        discount_type || 'fixed',
        parseFloat(discount_value) || 0,
        discountAmt,
        gst_type || 'none',
        effectiveGstPct,
        gstAmt,
        calcSubtotal,
        grandTotalVal,
        description || null,
        services ? JSON.stringify(services) : null,
        products ? JSON.stringify(products) : null,
        payment_method,
        req.user.id,
        vehicle_brand || null,
        vehicle_model || null,
        vehicle_reg_no || null,
        vehicle_category || null,
        req.franchiseId || franchise_id || req.user?.franchise_id || 1,
        discount_reason || null,
        discount_reference || null
      ]
    );

    // Create transaction record
    await conn.query(
      `INSERT INTO transactions (type, reference_id, amount, direction, note, transaction_date, created_by)
       VALUES ('job_revenue', ?, ?, 'in', ?, CURDATE(), ?)`,
      [result.insertId, grandTotalVal, `Manual Bill #${result.insertId}: ${description || 'POS Sale'}`, req.user.id]
    );

    // Log discount audit if applied
    if (numVal > 0) {
      const { logAudit } = require('./auditController');
      await logAudit(
        req.user?.id,
        'DISCOUNT_APPLIED',
        'manual_bills',
        result.insertId,
        {
          discount_type: discount_type || 'fixed',
          discount_value: numVal,
          discount_amount: discountAmt,
          discount_reason: discount_reason?.trim(),
          discount_reference: discount_reference?.trim()
        },
        req.ip
      );
    }

    // Emit real-time customer and manual bill updates
    const io = req.app.get('io');
    if (io) {
      io.emit('manual_bill_created', { id: result.insertId, customer_name, customer_mobile });
      io.emit('customer_updated', { customer_name, customer_mobile });
    }

    // If customer has mobile, send SMS
    if (customer_mobile) {
      try {
        const sendSms = require('../utils/sendSms');
        const msg = `O3 Car Spaa: Thank you ${customer_name || 'Customer'}! Your bill for Rs.${grandTotalVal} is confirmed.`;
        sendSms(customer_mobile, msg).catch(() => {});
      } catch (e) { /* ignore */ }
    }
    // GST auto-logging for Manual Bill
    const [gstSetting] = await conn.query("SELECT value FROM settings WHERE key_name = 'is_gst_applicable'");
    const isGstEnabled = gstSetting.length && gstSetting[0].value === '1';
    if (isGstEnabled) {
      const periodMonth = new Date().getMonth() + 1;
      const periodYear = new Date().getFullYear();
      const [gstSettingNo] = await conn.query("SELECT value FROM settings WHERE key_name = 'gstin'");
      const gstin = gstSettingNo.length ? gstSettingNo[0].value : '';

      const numericAmount = parseFloat(grandTotalVal);
      const taxableAmount = numericAmount / 1.18;
      const totalGst = numericAmount - taxableAmount;
      const cgst = totalGst / 2;
      const sgst = totalGst / 2;
      const igst = 0;

      await conn.query(
        `INSERT INTO v2_gst_records (record_type, gstin, taxable_amount, cgst, sgst, igst, total_gst, period_month, period_year)
         VALUES ('sales', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [gstin, taxableAmount, cgst, sgst, igst, totalGst, periodMonth, periodYear]
      );
    }

    await conn.commit();
    console.log(`[BILLING] Manual bill #${result.insertId} created — ₹${grandTotalVal}`);

    // Phase 5 Automation: Bill soft copy PDF auto-sent by WhatsApp/Email
    try {
      const notificationService = require('../services/notificationService');
      notificationService.handleBuySellBillAutoSend(result.insertId, 'manual_bill').catch(bErr => {
        console.error('[ManualBillAutoSend] Dispatch error (non-blocking):', bErr.message);
      });
    } catch (bErr) {
      console.error('[ManualBillAutoSend] Dispatch error (non-blocking):', bErr.message);
    }

    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Bill created' });
  } catch (err) {
    await conn.rollback();
    console.error('Create bill error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── LIST BILLS ─────────────────────────────
exports.list = async (req, res) => {
  try {
    const { page = 1, limit = 20, from_date, to_date, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = "mb.status != 'voided'";
    const params = [];

    // Multi-tenant franchise isolation
    const fCond = req.getFranchiseCondition
      ? req.getFranchiseCondition('mb.franchise_id')
      : { clause: ' AND (mb.franchise_id = ? OR mb.franchise_id IS NULL)', params: [req.franchiseId || 1] };
    where += fCond.clause;
    params.push(...fCond.params);

    if (from_date) { where += ' AND mb.created_at >= ?'; params.push(from_date); }
    if (to_date) { where += ' AND mb.created_at <= ?'; params.push(to_date + ' 23:59:59'); }
    if (search) {
      where += ' AND (mb.customer_name LIKE ? OR mb.customer_mobile LIKE ? OR mb.description LIKE ? OR mb.vehicle_reg_no LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM manual_bills mb WHERE ${where}`, params
    );

    const [rows] = await pool.query(`
      SELECT mb.*, u.name AS created_by_name,
             cu.name AS linked_customer_name
      FROM manual_bills mb
      LEFT JOIN users u ON mb.created_by = u.id
      LEFT JOIN users cu ON mb.customer_id = cu.id
      WHERE ${where}
      ORDER BY mb.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    res.json({
      success: true,
      data: rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: countRows[0].total },
    });
  } catch (err) {
    console.error('List bills error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET ONE BILL ───────────────────────────
exports.getOne = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT mb.*, u.name AS created_by_name
      FROM manual_bills mb
      LEFT JOIN users u ON mb.created_by = u.id
      WHERE mb.id = ?
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Bill not found' });
    const bill = rows[0];

    // Multi-tenant isolation: non-super admin can only view bill from their own franchise
    if (!req.isSuperAdmin && bill.franchise_id && req.franchiseId && parseInt(bill.franchise_id, 10) !== parseInt(req.franchiseId, 10)) {
      return res.status(403).json({ success: false, error: 'Access denied: Cannot access bill from another franchise' });
    }

    res.json({ success: true, data: bill });
  } catch (err) {
    console.error('Get bill error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── DOWNLOAD INVOICE PDF ────────────────────
exports.downloadInvoice = async (req, res) => {
  try {
    const { generateManualBillPDF } = require('../services/invoiceService');
    const { pdfBuffer, invoiceNumber } = await generateManualBillPDF(req.params.id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoiceNumber}.pdf"`,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Manual bill invoice error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate invoice' });
  }
};

// ─── SOFT DELETE (VOID) A BILL ──────────────────
exports.softDelete = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT franchise_id FROM manual_bills WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Bill not found' });
    if (!req.isSuperAdmin && existing[0].franchise_id && req.franchiseId && parseInt(existing[0].franchise_id, 10) !== parseInt(req.franchiseId, 10)) {
      return res.status(403).json({ success: false, error: 'Access denied: Cannot void bill from another franchise' });
    }

    await pool.query("UPDATE manual_bills SET status = 'voided' WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: 'Bill voided' });
  } catch (err) {
    console.error('Bill soft-delete error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── RESTORE A VOIDED BILL ─────────────────────
exports.restore = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT franchise_id FROM manual_bills WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Bill not found' });
    if (!req.isSuperAdmin && existing[0].franchise_id && req.franchiseId && parseInt(existing[0].franchise_id, 10) !== parseInt(req.franchiseId, 10)) {
      return res.status(403).json({ success: false, error: 'Access denied: Cannot restore bill from another franchise' });
    }

    await pool.query("UPDATE manual_bills SET status = 'paid' WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: 'Bill restored' });
  } catch (err) {
    console.error('Bill restore error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

