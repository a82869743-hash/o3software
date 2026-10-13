const pool = require('../config/db');

// ─── Unified list of all financial records ───────────────────────────────────
exports.listAll = async (req, res) => {
  try {
    const { type = 'all', from_date, to_date, search, page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const results = [];

    // ── 1. Job Carts ──────────────────────────────────────────────────────
    if (type === 'all' || type === 'job_cart') {
      let where = "jc.status = 'complete'";
      const params = [];
      if (from_date) { where += ' AND DATE(jc.completed_at) >= ?'; params.push(from_date); }
      if (to_date)   { where += ' AND DATE(jc.completed_at) <= ?'; params.push(to_date); }
      if (search)    { where += ' AND (u.name LIKE ? OR v.registration_no LIKE ? OR jc.invoice_number LIKE ?)'; const s = `%${search}%`; params.push(s,s,s); }

      const [rows] = await pool.query(`
        SELECT
          jc.id,
          'job_cart' AS type,
          COALESCE(jc.invoice_number, CONCAT('JC-', jc.id)) AS reference,
          u.name AS party_name,
          u.mobile AS party_mobile,
          COALESCE(jc.completed_at, jc.created_at) AS date,
          COALESCE(
            (SELECT SUM(js.service_price + js.labor_charges) FROM job_services js WHERE js.job_cart_id = jc.id)
            + COALESCE((SELECT SUM(jp.quantity * jp.unit_cost) FROM job_products jp JOIN job_services js2 ON jp.job_service_id = js2.id WHERE js2.job_cart_id = jc.id), 0),
            0
          ) AS amount,
          v.registration_no,
          jc.discount_type,
          jc.discount_value
        FROM job_carts jc
        JOIN vehicles v ON jc.vehicle_id = v.id
        JOIN users u ON v.customer_id = u.id
        WHERE ${where}
        ORDER BY date DESC
      `, params);
      results.push(...rows);
    }

    // ── 2. Manual Bills ───────────────────────────────────────────────────
    if (type === 'all' || type === 'manual_bill') {
      let where = "mb.status != 'voided'";
      const params = [];
      if (from_date) { where += ' AND DATE(mb.created_at) >= ?'; params.push(from_date); }
      if (to_date)   { where += ' AND DATE(mb.created_at) <= ?'; params.push(to_date); }
      if (search)    { where += ' AND (mb.customer_name LIKE ? OR mb.customer_mobile LIKE ? OR mb.vehicle_reg_no LIKE ?)'; const s = `%${search}%`; params.push(s,s,s); }

      const [rows] = await pool.query(`
        SELECT
          mb.id,
          'manual_bill' AS type,
          CONCAT('MB-', mb.id) AS reference,
          COALESCE(mb.customer_name, 'Walk-in Customer') AS party_name,
          mb.customer_mobile AS party_mobile,
          mb.created_at AS date,
          mb.amount,
          mb.vehicle_reg_no AS registration_no,
          mb.discount_type,
          mb.discount_value
        FROM manual_bills mb
        WHERE ${where}
        ORDER BY date DESC
      `, params);
      results.push(...rows);
    }

    // ── 3. Staff Salary ───────────────────────────────────────────────────
    if (type === 'all' || type === 'salary') {
      let where = '1=1';
      const params = [];
      if (from_date) { where += ' AND ss.created_at >= ?'; params.push(from_date); }
      if (to_date)   { where += ' AND ss.created_at <= ?'; params.push(to_date); }
      if (search)    { where += ' AND u.name LIKE ?'; params.push(`%${search}%`); }

      const [rows] = await pool.query(`
        SELECT
          ss.id,
          'salary' AS type,
          CONCAT('SAL-', ss.month_year, '-', ss.id) AS reference,
          u.name AS party_name,
          u.mobile AS party_mobile,
          ss.created_at AS date,
          ss.final_salary AS amount,
          NULL AS registration_no,
          NULL AS discount_type,
          NULL AS discount_value
        FROM staff_salary ss
        JOIN users u ON ss.staff_id = u.id
        WHERE ${where}
        ORDER BY date DESC
      `, params);
      results.push(...rows);
    }

    // ── 4. Buy & Sell ─────────────────────────────────────────────────────
    if (type === 'all' || type === 'buy_sell') {
      let where = '1=1';
      const params = [];
      if (from_date) { where += ' AND DATE(bs.transaction_date) >= ?'; params.push(from_date); }
      if (to_date)   { where += ' AND DATE(bs.transaction_date) <= ?'; params.push(to_date); }
      if (search)    { where += ' AND (bs.party_name LIKE ? OR bs.product_name LIKE ?)'; const s = `%${search}%`; params.push(s,s); }

      const [rows] = await pool.query(`
        SELECT
          bs.id,
          CONCAT('buy_sell_', bs.type) AS type,
          CONCAT(UPPER(bs.type), '-', bs.id) AS reference,
          bs.party_name,
          bs.party_mobile,
          bs.transaction_date AS date,
          bs.total_amount AS amount,
          NULL AS registration_no,
          NULL AS discount_type,
          NULL AS discount_value
        FROM buy_sell bs
        WHERE ${where}
        ORDER BY date DESC
      `, params);
      results.push(...rows);
    }

    // ── 5. Package Purchases ──────────────────────────────────────────────
    if (type === 'all' || type === 'package_purchase') {
      let where = "pr.status = 'approved'";
      const params = [];
      if (from_date) { where += ' AND DATE(pr.approved_at) >= ?'; params.push(from_date); }
      if (to_date)   { where += ' AND DATE(pr.approved_at) <= ?'; params.push(to_date); }
      if (search)    { where += ' AND (u.name LIKE ? OR v.registration_no LIKE ?)'; const s = `%${search}%`; params.push(s,s); }

      const [rows] = await pool.query(`
        SELECT
          pr.id,
          'package_purchase' AS type,
          CONCAT('PKG-', pr.id) AS reference,
          u.name AS party_name,
          u.mobile AS party_mobile,
          COALESCE(pr.approved_at, pr.created_at) AS date,
          pr.price AS amount,
          v.registration_no,
          NULL AS discount_type,
          NULL AS discount_value
        FROM package_requests pr
        JOIN users u ON pr.customer_id = u.id
        JOIN vehicles v ON pr.vehicle_id = v.id
        WHERE ${where}
        ORDER BY date DESC
      `, params);
      results.push(...rows);
    }

    // ── 6. Quick Washes ──────────────────────────────────────────────
    if (type === 'all' || type === 'quick_wash') {
      let where = "b.job_type = 'quick_wash' AND b.status = 'completed'";
      const params = [];
      if (from_date) { where += ' AND DATE(b.completed_at) >= ?'; params.push(from_date); }
      if (to_date)   { where += ' AND DATE(b.completed_at) <= ?'; params.push(to_date); }
      if (search)    { where += ' AND (u.name LIKE ? OR COALESCE(v.registration_no, b.vehicle_reg_no) LIKE ?)'; const s = `%${search}%`; params.push(s,s); }

      const [rows] = await pool.query(`
        SELECT
          b.id,
          'quick_wash' AS type,
          CONCAT('QW-', b.id) AS reference,
          COALESCE(u.name, 'Walk-in Customer') AS party_name,
          COALESCE(u.mobile, 'N/A') AS party_mobile,
          COALESCE(b.completed_at, b.created_at) AS date,
          COALESCE(b.total_amount, s.price_sedan, s.price_hatchback, 0) AS amount,
          COALESCE(v.registration_no, b.vehicle_reg_no) AS registration_no,
          COALESCE(v.brand, b.vehicle_brand) AS brand,
          COALESCE(v.model, b.vehicle_model) AS model,
          NULL AS discount_type,
          NULL AS discount_value
        FROM bookings b
        LEFT JOIN vehicles v ON b.vehicle_id = v.id
        LEFT JOIN users u ON (b.customer_id = u.id OR v.customer_id = u.id)
        LEFT JOIN services s ON b.service_id = s.id
        WHERE ${where}
        ORDER BY date DESC
      `, params);
      results.push(...rows);
    }

    // ── Sort all results newest first ─────────────────────────────────────
    results.sort((a, b) => new Date(b.date) - new Date(a.date));

    const total = results.length;
    const paginated = results.slice(offset, offset + parseInt(limit));

    res.json({
      success: true,
      data: paginated,
      pagination: { page: parseInt(page), limit: parseInt(limit), total },
    });
  } catch (err) {
    console.error('invoices listAll error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── EXPORT INVOICE AS PDF ──────────────────────────────────────────────
exports.exportPdf = async (req, res) => {
  try {
    const { id, type } = req.query;
    if (!id || !type) return res.status(400).json({ success: false, error: 'Missing id or type' });

    let invoiceData = null;

    if (type === 'job_cart') {
      const { generateInvoicePDF } = require('../services/invoiceService');
      const { pdfBuffer, invoiceNumber } = await generateInvoicePDF(id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=Invoice_${invoiceNumber || id}.pdf`);
      return res.send(pdfBuffer);
    } else if (type === 'manual_bill') {
      const [rows] = await pool.query('SELECT mb.*, mb.customer_id FROM manual_bills mb WHERE id = ?', [id]);
      if (rows.length) {
        const mb = rows[0];
        const [items] = await pool.query('SELECT item_name, quantity, rate FROM manual_bill_items WHERE manual_bill_id = ?', [id]);
        invoiceData = { ...mb, customer_name: mb.customer_name || 'Walk-in', title: 'Manual Bill', reference: `MB-${mb.id}`, date: mb.created_at, items: items.map(i => ({ name: i.item_name, price: Number(i.quantity) * Number(i.rate) })) };
      }
    } else if (type === 'quick_wash') {
      const [rows] = await pool.query(`
        SELECT b.*,
               COALESCE(b.customer_id, v.customer_id) as customer_id,
               COALESCE(u.name, 'Walk-in Customer') as customer_name,
               COALESCE(u.mobile, 'N/A') as customer_mobile,
               COALESCE(v.registration_no, b.vehicle_reg_no) as registration_no,
               COALESCE(v.brand, b.vehicle_brand) as brand,
               COALESCE(v.model, b.vehicle_model) as model,
               s.name as service_name,
               COALESCE(b.amount, s.price_sedan, s.price_hatchback, 0) as service_price
        FROM bookings b
        LEFT JOIN vehicles v ON b.vehicle_id = v.id
        LEFT JOIN users u ON (b.customer_id = u.id OR v.customer_id = u.id)
        LEFT JOIN services s ON b.service_id = s.id
        WHERE b.id = ? AND b.job_type = 'quick_wash'
      `, [id]);
      if (rows.length) {
        const b = rows[0];
        invoiceData = {
          ...b,
          title: 'Quick Wash Receipt',
          reference: `QW-${b.id}`,
          date: b.completed_at || b.created_at,
          items: [{ name: b.service_name || 'Quick Wash', price: Number(b.service_price || 0) }]
        };
      }
    }

    if (!invoiceData) return res.status(404).json({ success: false, error: 'Invoice not found' });

    // IDOR Protection: Customers can only download their own invoice
    if (req.user && req.user.role === 'customer') {
      const isOwner = invoiceData.customer_id && parseInt(invoiceData.customer_id) === parseInt(req.user.id);
      if (!isOwner) {
        return res.status(403).json({ success: false, error: "Access denied — Cannot access another customer's invoice PDF" });
      }
    }

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50 });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Invoice_${invoiceData.reference}.pdf`);
    doc.pipe(res);

    doc.fontSize(20).text('O3 Car Spaa', { align: 'center' });
    doc.fontSize(10).text('Premium Car Detailing Studio', { align: 'center' });
    doc.moveDown();
    
    doc.fontSize(14).text(invoiceData.title, { underline: true });
    doc.fontSize(10).text(`Reference: ${invoiceData.reference}`);
    doc.text(`Date: ${new Date(invoiceData.date || invoiceData.completed_at || invoiceData.created_at).toLocaleDateString()}`);
    doc.moveDown();
    
    doc.text(`Customer: ${invoiceData.customer_name || 'Walk-in Customer'}`);
    if (invoiceData.customer_mobile) doc.text(`Mobile: ${invoiceData.customer_mobile}`);
    if (invoiceData.registration_no) doc.text(`Vehicle: ${invoiceData.registration_no} ${invoiceData.brand ? `(${invoiceData.brand} ${invoiceData.model})` : ''}`);
    doc.moveDown();
    
    doc.text('---------------------------------------------------------');
    let total = 0;
    invoiceData.items.forEach(item => {
      doc.text(`${item.name} - INR ${item.price.toFixed(2)}`);
      total += item.price;
    });
    doc.text('---------------------------------------------------------');
    
    if (invoiceData.discount_value > 0) {
      doc.text(`Subtotal: INR ${total.toFixed(2)}`, { align: 'right' });
      let discountAmount = invoiceData.discount_type === 'percentage' ? (total * invoiceData.discount_value / 100) : invoiceData.discount_value;
      doc.text(`Discount: INR -${Number(discountAmount).toFixed(2)}`, { align: 'right' });
      total -= discountAmount;
    }
    
    doc.fontSize(12).text(`Total Amount: INR ${total.toFixed(2)}`, { align: 'right' });
    doc.moveDown(2);
    doc.fontSize(10).text('Thank you for your business!', { align: 'center' });
    
    doc.end();

  } catch (err) {
    console.error('Export PDF error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Server error' });
  }
};
