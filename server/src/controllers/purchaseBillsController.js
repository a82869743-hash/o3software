const pool = require('../config/db');

// Create purchase bill
exports.create = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { vendor_id, purchase_date, invoice_number, items, tax_amount = 0, notes } = req.body;

    if (!vendor_id || !purchase_date || !items || !items.length) {
      return res.status(400).json({ success: false, error: 'Vendor, date, and items are required' });
    }

    // 1. Calculate item totals and GST split per line item
    let totalTaxable = 0;
    let totalGstAmount = 0;

    const processedItems = items.map((item) => {
      const qty = parseFloat(item.quantity || 1);
      const unitCost = parseFloat(item.unit_price || 0);
      const lineTaxable = qty * unitCost;
      const gstRate = parseFloat(item.gst_rate || 0);
      const isIgst = Boolean(item.is_igst);

      let lineGst = 0;
      let cgst = 0;
      let sgst = 0;
      let igst = 0;

      if (gstRate > 0) {
        lineGst = (lineTaxable * gstRate) / 100;
        if (isIgst) {
          igst = lineGst;
        } else {
          cgst = lineGst / 2;
          sgst = lineGst / 2;
        }
      }

      totalTaxable += lineTaxable;
      totalGstAmount += lineGst;

      return {
        item_id: item.item_id,
        hsn_sac: item.hsn_sac || null,
        quantity: qty,
        unit_price: unitCost,
        gst_rate: gstRate,
        cgst_amount: cgst,
        sgst_amount: sgst,
        igst_amount: igst,
        total_price: lineTaxable + lineGst
      };
    });

    const finalTaxAmount = totalGstAmount > 0 ? totalGstAmount : parseFloat(tax_amount || 0);
    const finalTotal = totalTaxable + finalTaxAmount;

    // 2. Fetch vendor's previous running balance safely
    let previousBalance = 0;
    try {
      const [prevBalRow] = await connection.query(
        `SELECT running_balance FROM v2_purchases 
         WHERE vendor_id = ? 
         ORDER BY purchase_date DESC, id DESC LIMIT 1`,
        [vendor_id]
      );
      previousBalance = prevBalRow.length ? parseFloat(prevBalRow[0].running_balance || 0) : 0;
    } catch (balErr) {
      console.warn('Notice: running_balance column query warning:', balErr.message);
    }
    const runningBalance = previousBalance + finalTotal;

    // 3. Insert header
    const [headerResult] = await connection.query(
      `INSERT INTO v2_purchases (vendor_id, purchase_date, invoice_number, taxable_amount, tax_amount, total_amount, previous_balance, running_balance, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'received', ?)`,
      [vendor_id, purchase_date, invoice_number || null, totalTaxable, finalTaxAmount, finalTotal, previousBalance, runningBalance, notes || '']
    );
    const purchaseId = headerResult.insertId;

    // 4. Insert line items & update inventory stock
    for (const item of processedItems) {
      try {
        await connection.query(
          `INSERT INTO v2_purchase_items (purchase_id, item_id, hsn_sac, quantity, unit_price, gst_rate, cgst_amount, sgst_amount, igst_amount, total_price, received_quantity)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            purchaseId, item.item_id, item.hsn_sac || null, item.quantity, item.unit_price,
            item.gst_rate, item.cgst_amount, item.sgst_amount, item.igst_amount,
            item.total_price, item.quantity
          ]
        );
      } catch (itemErr) {
        console.warn('Notice: inserting line item with basic columns fallback:', itemErr.message);
        await connection.query(
          `INSERT INTO v2_purchase_items (purchase_id, item_id, quantity, unit_price, total_price, received_quantity)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            purchaseId, item.item_id, item.quantity, item.unit_price,
            item.total_price, item.quantity
          ]
        );
      }

      // Increment stock in inventory
      await connection.query(
        `UPDATE inventory SET quantity = quantity + ? WHERE id = ?`,
        [item.quantity, item.item_id]
      );
    }

    // 5. GST auto-logging
    const [gstSetting] = await connection.query("SELECT value FROM settings WHERE key_name = 'is_gst_applicable'");
    const isGstEnabled = gstSetting.length && gstSetting[0].value === '1';

    if (isGstEnabled || finalTaxAmount > 0) {
      const periodMonth = new Date(purchase_date).getMonth() + 1;
      const periodYear = new Date(purchase_date).getFullYear();
      const [gstSettingNo] = await connection.query("SELECT value FROM settings WHERE key_name = 'gstin'");
      const gstin = gstSettingNo.length ? gstSettingNo[0].value : '';

      let totalCgst = 0; let totalSgst = 0; let totalIgst = 0;
      processedItems.forEach(i => {
        totalCgst += i.cgst_amount;
        totalSgst += i.sgst_amount;
        totalIgst += i.igst_amount;
      });

      if (totalCgst === 0 && totalSgst === 0 && totalIgst === 0 && finalTaxAmount > 0) {
        totalCgst = finalTaxAmount / 2;
        totalSgst = finalTaxAmount / 2;
      }

      await connection.query(
        `INSERT INTO v2_gst_records (record_type, purchase_id, gstin, taxable_amount, cgst, sgst, igst, total_gst, period_month, period_year)
         VALUES ('purchase', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [purchaseId, gstin, totalTaxable, totalCgst, totalSgst, totalIgst, finalTaxAmount, periodMonth, periodYear]
      );
    }

    // 6. Create expense record linked to balance sheet
    await connection.query(
      `INSERT INTO v2_expenses (category, description, amount, expense_date, payment_mode, vendor_id, added_by)
       VALUES ('Inventory Purchase', ?, ?, ?, 'cash', ?, ?)`,
      [`Purchase Invoice #${invoice_number || purchaseId}`, finalTotal, purchase_date, vendor_id, req.user.id]
    );

    await connection.commit();
    res.status(201).json({
      success: true,
      data: { id: purchaseId, previous_balance: previousBalance, running_balance: runningBalance },
      message: 'Purchase bill recorded and inventory updated.'
    });
  } catch (err) {
    await connection.rollback();
    console.error('Create purchase bill error:', err);
    res.status(500).json({ success: false, error: 'Failed to record purchase bill' });
  } finally {
    connection.release();
  }
};

// List purchase bills
exports.list = async (req, res) => {
  try {
    const { from_date, to_date, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = '1=1';
    const params = [];

    if (from_date) { where += ' AND p.purchase_date >= ?'; params.push(from_date); }
    if (to_date) { where += ' AND p.purchase_date <= ?'; params.push(to_date); }

    const [rows] = await pool.query(
      `SELECT p.*, v.name as vendor_name
       FROM v2_purchases p
       LEFT JOIN vendors v ON p.vendor_id = v.id
       WHERE ${where}
       ORDER BY p.purchase_date DESC, p.id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM v2_purchases p WHERE ${where}`, params);

    res.json({
      success: true,
      data: rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: countRows[0].total }
    });
  } catch (err) {
    console.error('List purchases error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Get details of a single purchase bill (with tax analysis breakdown & vendor balance)
exports.getDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const [header] = await pool.query(
      `SELECT p.*, v.name as vendor_name, v.phone as vendor_phone, v.email as vendor_email, v.address as vendor_address
       FROM v2_purchases p
       LEFT JOIN vendors v ON p.vendor_id = v.id
       WHERE p.id = ?`,
      [id]
    );

    if (!header.length) return res.status(404).json({ success: false, error: 'Purchase bill not found' });

    const [items] = await pool.query(
      `SELECT pi.*, inv.product_name, inv.unit
       FROM v2_purchase_items pi
       LEFT JOIN inventory inv ON pi.item_id = inv.id
       WHERE pi.purchase_id = ?`,
      [id]
    );

    // Group items for GST Tax Analysis breakdown table
    const taxSummary = {};
    items.forEach((item) => {
      const key = `${item.hsn_sac || 'N/A'}_${item.gst_rate || 0}`;
      const lineTaxable = parseFloat(item.quantity) * parseFloat(item.unit_price);
      if (!taxSummary[key]) {
        taxSummary[key] = {
          hsn_sac: item.hsn_sac || 'N/A',
          rate: parseFloat(item.gst_rate || 0),
          taxable: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
        };
      }
      taxSummary[key].taxable += lineTaxable;
      taxSummary[key].cgst += parseFloat(item.cgst_amount || 0);
      taxSummary[key].sgst += parseFloat(item.sgst_amount || 0);
      taxSummary[key].igst += parseFloat(item.igst_amount || 0);
    });

    res.json({
      success: true,
      data: {
        ...header[0],
        items,
        tax_summary: Object.values(taxSummary)
      }
    });
  } catch (err) {
    console.error('Purchase detail error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
