const pool = require('../config/db');
const { guessCarCategory } = require('../utils/carCategory');
const importService = require('../services/importService');
const bcrypt = require('bcryptjs');

// ─── IMPORT CUSTOMERS (old customers with their history) ─────────────
// One row = one customer (repeat the mobile on more rows for more cars / packages). Only name + mobile are needed.
// Read and saved where the app already uses it:
//   car → vehicles · loyalty → loyalty · package → user_packages (+ services used, schedules, purchase log)
//   pending balance → advance_payments (Payments → Advances, dashboard "balance due", reminders)
//   last visit, services, remarks and every column we do not know → the customer's CRM notes (nothing is dropped)
// Old money already received is NOT added to today's income; it shows on the package and the customer.
// ?dry_run=1 → reads and checks everything, saves nothing, returns the same report.
const userPkgCtrlEarly = require('./userPackagesController');
const { validateRegNo } = require('../utils/validators');
const PAY_MODES = ['cash', 'upi', 'card', 'net_banking', 'qr', 'wallet', 'other'];
const payMode = (v) => { const t = String(v || '').toLowerCase().replace(/[^a-z]/g, ''); return PAY_MODES.find(m => m.replace('_', '') === t) || (/gpay|phonepe|paytm/.test(t) ? 'upi' : /bank|neft|imps|rtgs/.test(t) ? 'net_banking' : 'cash'); };
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const ymd = (d) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;

async function findPackage(conn, name) {
  const n = String(name).trim();
  const [exact] = await conn.query('SELECT id, name, package_validity FROM packages WHERE LOWER(TRIM(name)) = LOWER(?) LIMIT 1', [n]);
  if (exact.length) return exact[0];
  const [like] = await conn.query('SELECT id, name, package_validity FROM packages WHERE LOWER(name) LIKE LOWER(?) ORDER BY LENGTH(name) LIMIT 1', [`%${n}%`]);
  if (like.length) return like[0];
  const [rev] = await conn.query('SELECT id, name, package_validity FROM packages WHERE ? LIKE CONCAT(\'%\', LOWER(name), \'%\') ORDER BY LENGTH(name) DESC LIMIT 1', [n.toLowerCase()]);
  return rev[0] || null;
}

exports.importCustomers = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  const dryRun = ['1', 'true', 'yes'].includes(String(req.query.dry_run || req.body?.dry_run || '').toLowerCase());
  const fid = Number(req.franchiseId) || Number(req.user?.franchise_id) || 1;
  const conn = await pool.getConnection();
  try {
    const { rows, sheets } = importService.readSheets(req.file.buffer, importService.CUSTOMER_FIELDS, ['customer_name', 'mobile']);
    const { valid, errors } = importService.validateCustomers(rows);
    if (!valid.length) return res.status(400).json({ success: false, error: 'No customer rows found. The file needs at least a Name and a Mobile column.', data: { sheets, errors } });

    await conn.beginTransaction();
    const out = { customers_created: 0, customers_updated: 0, cars_added: 0, packages_added: 0, packages_already_there: 0, balances_added: 0, pending_total: 0, notes_added: 0 };
    const warnings = []; const rowErrors = [...errors]; const touched = new Set();
    const today = new Date(new Date().toDateString());

    for (const rec of valid) {
      const where = rec._where; const W = (reason) => warnings.push({ where, reason });
      try {
        await conn.query('SAVEPOINT r');
        // 1. customer by mobile (this studio)
        const [found] = await conn.query('SELECT id, role, franchise_id, address, email, crm_notes FROM users WHERE mobile = ? AND COALESCE(is_deleted, 0) = 0', [rec.mobile_number]);
        let cust = found[0];
        if (cust && cust.role !== 'customer') { rowErrors.push({ row: rec._rowIndex, where, field: 'mobile', reason: `${rec.mobile_number} is a staff / admin account` }); await conn.query('ROLLBACK TO SAVEPOINT r'); continue; }
        if (cust && Number(cust.franchise_id || 1) !== fid && req.user.role !== 'super_admin') {
          rowErrors.push({ row: rec._rowIndex, where, field: 'mobile', reason: `${rec.mobile_number} is a customer of another studio` }); await conn.query('ROLLBACK TO SAVEPOINT r'); continue;
        }
        if (!cust) {
          const [ins] = await conn.query("INSERT INTO users (name, mobile, email, password_hash, role, franchise_id, address) VALUES (?, ?, ?, 'manual', 'customer', ?, ?)",
            [rec.customer_name, rec.mobile_number, rec.email, fid, rec.address ? rec.address.slice(0, 300) : null]);
          cust = { id: ins.insertId, crm_notes: '' };
          out.customers_created++;
        } else {
          if (!touched.has(cust.id)) out.customers_updated++;
          if ((!cust.address && rec.address) || (!cust.email && rec.email)) {
            await conn.query('UPDATE users SET address = COALESCE(address, ?), email = COALESCE(email, ?) WHERE id = ?', [rec.address ? rec.address.slice(0, 300) : null, rec.email, cust.id]);
          }
        }
        touched.add(cust.id);
        if (rec.bad_email) W(`email "${rec.bad_email}" is not valid, kept in notes`);

        // 2. car (optional)
        let vehicleId = null; let category = rec.category;
        if (rec.reg_raw) {
          const reg = validateRegNo(rec.reg_raw);
          if (!reg.valid) W(`car number "${rec.reg_raw}" is not valid (${reg.error}), kept in notes`);
          else {
            const [veh] = await conn.query('SELECT id, customer_id, category FROM vehicles WHERE registration_no = ?', [reg.value]);
            if (veh.length && Number(veh[0].customer_id) !== Number(cust.id)) W(`car ${reg.value} already belongs to another customer, not linked`);
            else if (veh.length) { vehicleId = veh[0].id; category = category || veh[0].category; }
            else {
              category = category || guessCarCategory(rec.car_brand, rec.car_model) || 'sedan';
              const [v] = await conn.query('INSERT INTO vehicles (registration_no, customer_id, brand, model, category, color) VALUES (?, ?, ?, ?, ?, ?)',
                [reg.value, cust.id, rec.car_brand || 'Unknown', [rec.car_model, rec.variant].filter(Boolean).join(' ') || 'Unknown', category, rec.color ? String(rec.color).slice(0, 50) : null]);
              vehicleId = v.insertId; out.cars_added++;
              if (!rec.car_brand || !rec.car_model) W(`car ${reg.value} added without ${!rec.car_brand ? 'brand' : 'model'}, please fill it in`);
            }
          }
        } else if (rec.car_brand || rec.car_model) W('car brand / model given without a car number, kept in notes');

        // 3. loyalty (never counted twice on a re-import)
        if (rec.loyalty_credits || rec.free_washes || rec.wax_count) {
          await conn.query(`INSERT INTO loyalty (customer_id, credits, free_washes, wax_count) VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE credits = GREATEST(credits, VALUES(credits)), free_washes = GREATEST(free_washes, VALUES(free_washes)), wax_count = GREATEST(wax_count, VALUES(wax_count))`,
            [cust.id, rec.loyalty_credits, Math.round(rec.free_washes), Math.round(rec.wax_count)]);
        }

        // 4. money for this row: total / paid / pending (any two give the third)
        let total = rec.total_price, paid = rec.price_paid, pending = rec.pending;
        if (total === null && paid !== null && pending !== null) total = paid + pending;
        if (paid === null && total !== null) paid = Math.max(0, total - (pending || 0));
        if (pending === null && total !== null && paid !== null) pending = Math.max(0, total - paid);
        total = total === null ? null : r2(total); paid = paid === null ? null : r2(paid); pending = r2(pending || 0);
        if (total !== null && paid !== null && paid > total) W(`paid ₹${paid} is more than the total ₹${total}`);

        // 5. package (optional)
        let pkgNote = '';
        if (rec.package_name) {
          const pkg = await findPackage(conn, rec.package_name);
          if (!pkg) { W(`package "${rec.package_name}" is not in the app, kept in notes`); pkgNote = `Package (not in app): ${rec.package_name}`; }
          else {
            const months = Number(pkg.package_validity) || 12;
            let start = rec.purchase_date, end = rec.end_date;
            if (!start && end) { start = new Date(end); start.setMonth(start.getMonth() - months); W(`no purchase date for "${pkg.name}", taken as ${months} months before the expiry date`); }
            if (!start) { start = today; W(`no purchase date for "${pkg.name}", today is used`); }
            if (!end) { end = new Date(start); end.setMonth(end.getMonth() + months); }
            if (end < start) { W(`expiry date is before the purchase date for "${pkg.name}", expiry set to ${months} months after purchase`); end = new Date(start); end.setMonth(end.getMonth() + months); }
            const [dup] = await conn.query('SELECT id FROM user_packages WHERE user_id = ? AND package_id = ? AND DATE(start_date) = ?', [cust.id, pkg.id, ymd(start)]);
            if (dup.length) { out.packages_already_there++; rec._pkgName = pkg.name; rec._pkgDup = true; W(`package "${pkg.name}" from ${ymd(start)} is already on this customer, not added again`); }
            else {
              const status = end < today ? 'expired' : 'active';
              const [up] = await conn.query(
                `INSERT INTO user_packages (user_id, package_id, vehicle_id, start_date, end_date, price_paid, payment_status, package_status, vehicle_segment, franchise_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [cust.id, pkg.id, vehicleId, ymd(start), ymd(end), paid ?? total ?? 0, pending > 0 ? 'pending' : 'paid', status, category || null, fid]);
              const upId = up.insertId; out.packages_added++;
              // services: total per service from the package; used = "services used" or total − "services left"
              const breakdown = await userPkgCtrlEarly.getServiceBreakdown(conn, pkg.id, pkg.name);
              const allCount = breakdown.reduce((a, x) => a + Number(x.total_count || 0), 0);
              let used = rec.services_used !== null ? Math.round(rec.services_used) : rec.services_left !== null ? Math.max(0, allCount - Math.round(rec.services_left)) : 0;
              if (used > allCount) { W(`services used ${used} is more than the package has (${allCount}), set to ${allCount}`); used = allCount; }
              for (const sv of breakdown) {
                const u = Math.min(Number(sv.total_count || 0), used); used -= u;
                await conn.query('INSERT INTO package_usage (user_package_id, service_name, used_count, usage_status, consumed_at) VALUES (?, ?, ?, ?, ?)',
                  [upId, sv.service_name, u, u >= Number(sv.total_count || 0) && u > 0 ? 'consumed' : 'available', u > 0 ? (ymd(rec.last_visit) || ymd(start)) : null]);
              }
              if (status === 'active') {
                await userPkgCtrlEarly.generatePackageSchedules(conn, upId, cust.id, pkg.id, start, months);
                await conn.query('UPDATE package_service_schedules SET vehicle_id = ?, franchise_id = ? WHERE user_package_id = ?', [vehicleId, fid, upId]);
              }
              await conn.query(`INSERT INTO v2_package_renewals (customer_id, package_id, customer_package_id, renewal_date, amount_paid, renewed_by, notes)
                VALUES (?, ?, ?, ?, ?, 'import', ?)`, [cust.id, pkg.id, upId, ymd(start), paid ?? total ?? 0, 'Imported (old customer) package purchase']);
              pkgNote = `Package: ${pkg.name} ${ymd(start)} to ${ymd(end)}`;
              rec._pkgId = upId; rec._pkgName = pkg.name;
            }
          }
        }

        // 6. pending balance → Payments → Advances (collect it there later)
        if (pending > 0) {
          const [dupBal] = await conn.query("SELECT id FROM advance_payments WHERE customer_id = ? AND notes LIKE ? AND status <> 'cancelled' AND total_amount = ?",
            [cust.id, `Imported balance: ${rec._pkgName || 'old services'}%`, total ?? r2((paid || 0) + pending)]);
          if (dupBal.length) W(`pending ₹${pending} is already recorded, not added again`);
          else {
            await conn.query(`INSERT INTO advance_payments (customer_id, advance_amount, total_amount, balance_due, payment_method, status, due_date, notes, created_by)
              VALUES (?, ?, ?, ?, ?, 'advance_paid', ?, ?, ?)`,
              [cust.id, paid || 0, total ?? r2((paid || 0) + pending), pending, payMode(rec.payment_mode), ymd(rec.due_date),
                `Imported balance: ${rec._pkgName || 'old services'}${rec._pkgId ? ` (package #${rec._pkgId})` : ''}`, req.user.id]);
            out.balances_added++; out.pending_total = r2(out.pending_total + pending);
          }
        }

        // 7. everything else → CRM notes (only lines not already there)
        const lines = [
          pkgNote,
          !rec._pkgId && !rec._pkgDup && (total !== null || paid !== null) ? `Paid ₹${paid ?? 0}${total !== null ? ` of ₹${total}` : ''}${pending ? `, pending ₹${pending}` : ''}${rec.payment_mode ? ` (${rec.payment_mode})` : ''}` : '',
          rec.last_visit ? `Last visit: ${ymd(rec.last_visit)}` : rec.last_visit_raw ? `Last visit: ${rec.last_visit_raw}` : '',
          rec.service_history ? `Services: ${rec.service_history}` : '',
          rec.notes ? `Remarks: ${rec.notes}` : '',
          rec.reg_raw && !vehicleId ? `Car: ${[rec.reg_raw, rec.car_brand, rec.car_model].filter(Boolean).join(' ')}` : (!rec.reg_raw && (rec.car_brand || rec.car_model) ? `Car: ${[rec.car_brand, rec.car_model].filter(Boolean).join(' ')}` : ''),
          rec.bad_email ? `Email: ${rec.bad_email}` : '',
          ...rec.extra,
        ].filter(Boolean);
        const [[nowNotes]] = await conn.query('SELECT crm_notes FROM users WHERE id = ?', [cust.id]);
        const have = String(nowNotes?.crm_notes || '');
        const add = lines.filter(l => !have.includes(l));
        if (add.length) {
          await conn.query('UPDATE users SET crm_notes = ? WHERE id = ?', [`${have ? have + '\n' : ''}[Imported ${ymd(today)}] ${add.join(' · ')}`.slice(0, 60000), cust.id]);
          out.notes_added++;
        }
        await conn.query('RELEASE SAVEPOINT r');
      } catch (err) {
        await conn.query('ROLLBACK TO SAVEPOINT r').catch(() => {});
        rowErrors.push({ row: rec._rowIndex, where, field: 'general', reason: err.message });
      }
    }

    if (dryRun) await conn.rollback(); else await conn.commit();
    res.json({
      success: true,
      message: dryRun ? 'File checked. Nothing was saved yet.' : 'Import complete',
      data: { dry_run: dryRun, total: valid.length + errors.length, ...out, errors: rowErrors, warnings, sheets },
    });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('Customer import error:', err);
    res.status(500).json({ success: false, error: 'Failed to process import file' });
  } finally {
    conn.release();
  }
};

// ─── IMPORT INVENTORY ─────────────────────────
exports.importInventory = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  const dryRun = ['1', 'true', 'yes'].includes(String(req.query.dry_run || req.body?.dry_run || '').toLowerCase());
  // stock=set → quantity in the file is the stock now (opening stock); stock=add (default) → added to current stock
  const setStock = String(req.query.stock || req.body?.stock || 'add') === 'set';
  const conn = await pool.getConnection();
  try {
    const { rows, sheets } = importService.readSheets(req.file.buffer, importService.INVENTORY_FIELDS, ['product_name']);
    const { valid, errors } = importService.validateInventory(rows);
    if (!valid.length) return res.status(400).json({ success: false, error: 'No product rows found. The file needs a Product Name column.', data: { sheets, errors } });

    await conn.beginTransaction();
    let created = 0, updated = 0;
    const warnings = [];
    const fid = Number(req.franchiseId) || 1;
    const canPrice = req.user.role === 'super_admin';
    if (!canPrice && valid.some(r => ['cost_price', 'selling_price', 'franchise_price', 'staff_price'].some(f => r[f] !== undefined))) {
      warnings.push({ where: 'prices', reason: 'Prices in the file were not changed: only the Super Admin sets prices (Inventory → product).' });
    }
    for (const record of valid) {
      const [existing] = await conn.query(
        'SELECT id FROM inventory WHERE is_deleted = 0 AND franchise_id = ? AND (LOWER(product_name) = LOWER(?) OR (? IS NOT NULL AND sku = ?)) ORDER BY (LOWER(product_name) = LOWER(?)) DESC LIMIT 1',
        [fid, record.product_name, record.sku, record.sku, record.product_name]);
      const priceSets = canPrice ? ['cost_price', 'selling_price', 'franchise_price', 'staff_price'].filter(f => record[f] !== undefined) : [];
      const extraSets = ['gst_pct', 'discount_pct'].filter(f => record[f] !== undefined);
      if (existing.length > 0) {
        await conn.query(
          `UPDATE inventory SET quantity = ${setStock ? '?' : 'quantity + ?'}, low_stock_threshold = ?, unit = ?,
             sku = COALESCE(?, sku), category = COALESCE(?, category), brand = COALESCE(?, brand), description = COALESCE(?, description)
             ${[...priceSets, ...extraSets].map(f => `, ${f} = ?`).join('')}
           WHERE id = ?`,
          [record.quantity || 0, record.low_stock_threshold || 5, record.unit || 'pcs', record.sku, record.category, record.brand, record.description,
            ...priceSets.map(f => record[f]), ...extraSets.map(f => record[f]), existing[0].id]);
        updated++;
      } else {
        await conn.query(
          `INSERT INTO inventory (product_name, unit, quantity, low_stock_threshold, sku, category, brand, description, franchise_id,
             cost_price, selling_price, franchise_price, staff_price, gst_pct, discount_pct)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [record.product_name, record.unit || 'pcs', record.quantity || 0, record.low_stock_threshold || 5, record.sku, record.category, record.brand, record.description, fid,
            canPrice ? record.cost_price || 0 : 0, canPrice ? record.selling_price || 0 : 0, canPrice ? record.franchise_price || 0 : 0, canPrice ? record.staff_price || 0 : 0,
            record.gst_pct ?? 18, record.discount_pct ?? 0]);
        created++;
      }
    }
    if (dryRun) await conn.rollback(); else await conn.commit();
    res.json({
      success: true,
      message: dryRun ? 'File checked. Nothing was saved yet.' : 'Import complete',
      data: { dry_run: dryRun, total: valid.length + errors.length, created, updated, stock_mode: setStock ? 'set' : 'add', errors, warnings, sheets },
    });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('Inventory import error:', err);
    res.status(500).json({ success: false, error: 'Failed to process import file' });
  } finally {
    conn.release();
  }
};

// ─── DOWNLOAD TEMPLATE ────────────────────────
exports.downloadTemplate = async (req, res) => {
  try {
    const { type } = req.query; // 'customers' or 'inventory'
    const xlsx = require('xlsx');

    const wb = xlsx.utils.book_new();
    let ws;

    const TEMPLATES = {
      customers: [
        ['Customer Name', 'Mobile', 'Email', 'Address', 'Vehicle Reg No', 'Car Brand', 'Car Model', 'Car Type', 'Colour', 'Package Name', 'Purchase Date', 'Expiry Date',
          'Total Price', 'Amount Paid', 'Pending', 'Due Date', 'Payment Mode', 'Services Used', 'Last Visit', 'Services', 'Free Washes', 'Loyalty Credits', 'Remarks'],
        ['Rahul Shah', '9876543210', 'rahul@email.com', 'Anand', 'GJ06AB1234', 'Maruti Suzuki', 'Swift', 'Hatchback', 'White', '12 Washes - 12 Months', '15/03/2026', '',
          '3600', '2000', '1600', '30/11/2026', 'UPI', '4', '20/10/2026', 'Foam wash, interior', '0', '0', 'Prefers Sunday'],
      ],
      inventory: [
        ['Product Name', 'SKU', 'Category', 'Brand', 'Unit', 'Quantity', 'Low Stock Threshold', 'Cost Price', 'Franchise Price', 'Selling Price', 'Staff Price', 'GST %', 'Discount %', 'Description'],
        ['Ceramic Coating 9H 50ml', 'CC-9H-50', 'Coatings', 'O3 Care', 'bottle', '10', '3', '', '', '', '', '18', '0', ''],
      ],
      services: [
        ['Service Name', 'Category', 'Description', 'Duration Minutes', 'Hatchback', 'Sedan', 'Mini SUV', 'SUV', 'Luxury', 'Luxury + SUV'],
        ['Exterior Wash + Shampoo & Vacuum', 'Washing', 'Exterior foam wash, shampoo and vacuum', '45', '400', '500', '500', '500', '500', '700'],
      ],
    };
    if (!TEMPLATES[type]) return res.status(400).json({ success: false, error: 'Invalid template type. Use customers, inventory or services.' });
    ws = xlsx.utils.aoa_to_sheet(TEMPLATES[type]);
    ws['!cols'] = TEMPLATES[type][0].map(h => ({ wch: Math.max(14, h.length + 2) }));

    xlsx.utils.book_append_sheet(wb, ws, 'Template');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="${type}_template.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error('Download template error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate template' });
  }
};


// ─── IMPORT SERVICES (catalog + per-car-type prices) ─────
exports.importServices = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  const conn = await pool.getConnection();
  try {
    const parsed = importService.parseFile(req.file.buffer, req.file.originalname);
    const { valid, errors } = importService.validateServices(parsed);
    if (!valid.length) return res.status(400).json({ success: false, error: 'No valid rows found', details: errors });
    await conn.beginTransaction();
    let inserted = 0, updated = 0;
    for (const r of valid) {
      let categoryId = null;
      if (r.category) {
        const [[cat]] = await conn.query('SELECT id FROM service_categories WHERE name = ?', [r.category]);
        if (cat) categoryId = cat.id;
        else { const [ins] = await conn.query('INSERT INTO service_categories (name, sort_order, is_active) VALUES (?, 50, 1)', [r.category.slice(0, 100)]); categoryId = ins.insertId; }
      }
      const vals = [r.description, r.duration_minutes, r.price_hatchback, r.price_semi_sedan, r.price_sedan, r.price_premium_sedan, r.price_suv, r.price_premium_suv, categoryId];
      const [[ex]] = await conn.query('SELECT id FROM services WHERE name = ?', [r.name]);
      if (ex) {
        await conn.query(
          `UPDATE services SET description = COALESCE(?, description), duration_minutes = ?, price_hatchback = ?, price_semi_sedan = ?,
             price_sedan = ?, price_premium_sedan = ?, price_suv = ?, price_premium_suv = ?, category_id = COALESCE(?, category_id), is_active = 1 WHERE id = ?`,
          [...vals, ex.id]);
        updated++;
      } else {
        await conn.query(
          `INSERT INTO services (name, description, duration_minutes, price_hatchback, price_semi_sedan, price_sedan, price_premium_sedan,
             price_suv, price_premium_suv, category_id, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [r.name, ...vals]);
        inserted++;
      }
    }
    await conn.commit();
    res.json({ success: true, message: `Services imported: ${inserted} new, ${updated} updated`, data: { totalParsed: parsed.length, inserted, updated, validationErrors: errors } });
  } catch (err) {
    await conn.rollback();
    console.error('Services import error:', err);
    res.status(500).json({ success: false, error: 'Failed to process import file' });
  } finally {
    conn.release();
  }
};
