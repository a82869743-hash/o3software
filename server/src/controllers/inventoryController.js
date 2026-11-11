const pool = require('../config/db');
// A studio admin may change only their own studio's products; the main catalog is changed by its own admins and the Super Admin.
// product fields that must make sense: status active/inactive, discount 0–100 %, GST 0–28 %, prices and stock 0 or more
function productFieldError(b) {
  if (b.status !== undefined && !['active', 'inactive'].includes(b.status)) return 'Status must be active or inactive';
  if (b.discount_pct !== undefined && b.discount_pct !== null && b.discount_pct !== '' && !(Number(b.discount_pct) >= 0 && Number(b.discount_pct) <= 100)) return 'Discount must be 0 to 100 %';
  if (b.gst_pct !== undefined && b.gst_pct !== null && b.gst_pct !== '' && !(Number(b.gst_pct) >= 0 && Number(b.gst_pct) <= 28)) return 'GST must be 0 to 28 %';
  for (const k of ['cost_price', 'franchise_price', 'selling_price', 'staff_price', 'quantity', 'low_stock_threshold']) {
    if (b[k] !== undefined && b[k] !== null && b[k] !== '' && !(Number(b[k]) >= 0)) return `${k.replace(/_/g, ' ')} must be 0 or more`;
  }
  return null;
}
const ownProducts = (req) => (req.user.role === 'super_admin' ? '' : ` AND COALESCE(franchise_id, 1) = ${Number(req.franchiseId) || Number(req.user.franchise_id) || 1}`);
const xlsx = require('xlsx');

// Helper: Sanitize item prices based on user role and optional franchise context
async function sanitizeItemForRole(item, userRole = 'customer', franchiseId = 1) {
  const sanitized = { ...item, is_low_stock: !!item.is_low_stock };

  // Fetch franchise-specific price override if applicable
  if (franchiseId && item.id) {
    try {
      const [fOverrides] = await pool.query(
        'SELECT franchise_price, selling_price FROM franchise_inventory_pricing WHERE inventory_id = ? AND franchise_id = ?',
        [item.id, franchiseId]
      );
      if (fOverrides.length) {
        if (fOverrides[0].franchise_price !== null && fOverrides[0].franchise_price !== undefined) {
          sanitized.franchise_price = parseFloat(fOverrides[0].franchise_price);
        }
        if (fOverrides[0].selling_price !== null && fOverrides[0].selling_price !== undefined) {
          sanitized.selling_price = parseFloat(fOverrides[0].selling_price);
        }
        sanitized.has_franchise_override = true;
      }

      // In non-main franchise view context, if the item belongs to main studio catalog and has not been transferred yet,
      // override quantity to 0 to reflect actual stock present at that franchise.
      if (franchiseId !== 1 && item.franchise_id !== franchiseId) {
        sanitized.quantity = 0;
        sanitized.is_low_stock = true;
      }
    } catch (e) {}
  }

  // Super Admin controls which price tiers each role can see (Settings → price_visibility)
  return require('../services/priceVisibility').applyPriceVisibility(sanitized, userRole);
  // eslint-disable-next-line no-unreachable
  if (userRole === 'franchise') {
    // Franchise profile ONLY sees their wholesale franchise_price and customer selling_price
    delete sanitized.cost_price;
    delete sanitized.staff_price;
    delete sanitized.price_visible_to_staff;
    return sanitized;
  } else if (userRole === 'staff') {
    // Staff profile NEVER sees cost_price or franchise_price
    delete sanitized.cost_price;
    delete sanitized.franchise_price;
    if (sanitized.price_visible_to_staff === 0) {
      sanitized.selling_price = null;
      sanitized.staff_price = null;
    }
    return sanitized;
  } else {
    // Customer / Public ONLY sees customer selling_price
    delete sanitized.cost_price;
    delete sanitized.franchise_price;
    delete sanitized.staff_price;
    delete sanitized.price_visible_to_staff;
    return sanitized;
  }
}

// ─── LIST ───────────────────────────────────
exports.list = async (req, res) => {
  try {
    const { search, low_stock, page = 1, limit = 100, category, brand, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const userRole = req.user ? req.user.role : 'customer';
    const targetFid = req.franchiseId !== undefined && req.franchiseId !== null ? req.franchiseId : 1;

    let where = 'is_deleted = 0';
    const params = [];
    // studio supplies are internal: customers never see them
    if (userRole === 'customer') where += " AND COALESCE(category, '') <> 'Studio Materials'";

    if (!req.isGlobalAdmin) {
      if (targetFid && targetFid !== 1) {
        where += ' AND (franchise_id = ? OR id IN (SELECT inventory_id FROM franchise_inventory_pricing WHERE franchise_id = ?))';
        params.push(targetFid, targetFid);
      } else {
        where += ' AND (franchise_id = 1 OR franchise_id IS NULL)';
      }
    }

    if (search) {
      where += ' AND (product_name LIKE ? OR sku LIKE ? OR barcode LIKE ? OR brand LIKE ? OR category LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }

    if (low_stock === 'true' || low_stock === '1') {
      where += ' AND (low_stock_threshold > 0 AND quantity <= low_stock_threshold)';
    }

    if (category) {
      where += ' AND category = ?';
      params.push(category);
    }

    if (brand) {
      where += ' AND brand = ?';
      params.push(brand);
    }

    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM inventory WHERE ${where}`, params);

    const [rows] = await pool.query(
      `SELECT *, ((low_stock_threshold > 0 AND quantity <= low_stock_threshold)) AS is_low_stock
       FROM inventory WHERE ${where}
       ORDER BY product_name ASC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const sanitizedData = await Promise.all(rows.map(r => sanitizeItemForRole(r, userRole, targetFid)));

    res.json({
      success: true,
      data: sanitizedData,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: countRows[0].total },
    });
  } catch (err) {
    console.error('Inventory list error:', err.message);
    res.json({
      success: true,
      data: [],
      pagination: { page: 1, limit: 100, total: 0 }
    });
  }
};

// ─── GET ONE ────────────────────────────────
exports.getOne = async (req, res) => {
  try {
    const userRole = req.user ? req.user.role : 'customer';
    const franchiseId = req.franchiseId || 1;

    const [rows] = await pool.query(
      'SELECT *, ((low_stock_threshold > 0 AND quantity <= low_stock_threshold)) AS is_low_stock FROM inventory WHERE id = ? AND is_deleted = 0',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Product not found' });
    
    const item = await sanitizeItemForRole(rows[0], userRole, franchiseId);
    res.json({ success: true, data: item });
  } catch (err) {
    console.error('Inventory getOne error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CREATE ─────────────────────────────────
exports.create = async (req, res) => {
  try {
    // Prices are set by HQ only (Super Admin). Others may manage stock details but not prices.
    if (req.user.role !== 'super_admin') {
      for (const f of ['cost_price', 'franchise_price', 'selling_price', 'staff_price', 'price_visible_to_staff', 'target_franchises']) delete req.body[f];
    }
    { const fe = productFieldError(req.body); if (fe) return res.status(400).json({ success: false, error: fe }); }
    const {
      product_name, unit = 'pcs',quantity = 0, low_stock_threshold = 5, images_json, description,
      sku, barcode, category, sub_category, brand, vehicle_compatibility, variant,
      cost_price = 0, franchise_price = 0, selling_price = 0, staff_price = 0, price_visible_to_staff = 1,
      discount_pct = 0, gst_pct = 0,
      supplier, purchase_date, purchase_invoice_no, warehouse_location,
      warranty, serial_number, expiry_date, status = 'active', target_franchises
    } = req.body;

    if (!product_name) return res.status(400).json({ success: false, error: 'Product name is required' });

    const imagesVal = images_json ? (typeof images_json === 'string' ? images_json : JSON.stringify(images_json)) : null;

    const franchiseId = req.franchiseId || 1;

    const [result] = await pool.query(
      `INSERT INTO inventory (
        product_name, unit, quantity, low_stock_threshold, images_json, description,
        sku, barcode, category, sub_category, brand, vehicle_compatibility, variant,
        cost_price, franchise_price, selling_price, staff_price, price_visible_to_staff,
        discount_pct, gst_pct, supplier, purchase_date, purchase_invoice_no, warehouse_location,
        warranty, serial_number, expiry_date, status, franchise_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product_name, unit, quantity, low_stock_threshold, imagesVal, description || null,
        sku || null, barcode || null, category || null, sub_category || null, brand || null, vehicle_compatibility || null, variant || null,
        cost_price, franchise_price, selling_price, staff_price, price_visible_to_staff,
        discount_pct, gst_pct, supplier || null, purchase_date || null, purchase_invoice_no || null, warehouse_location || null,
        warranty || null, serial_number || null, expiry_date || null, status, franchiseId
      ]
    );

    const newProductId = result.insertId;

    // Handle target_franchises array if provided
    if (Array.isArray(target_franchises) && target_franchises.length > 0) {
      for (const tf of target_franchises) {
        if (tf.franchise_id) {
          const fPrice = tf.franchise_price !== undefined ? parseFloat(tf.franchise_price) : parseFloat(franchise_price);
          const sPrice = tf.selling_price !== undefined && tf.selling_price !== null ? parseFloat(tf.selling_price) : parseFloat(selling_price);
          await pool.query(
            `INSERT INTO franchise_inventory_pricing (inventory_id, franchise_id, franchise_price, selling_price)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE franchise_price = VALUES(franchise_price), selling_price = VALUES(selling_price)`,
            [newProductId, tf.franchise_id, fPrice, sPrice]
          );
        }
      }
    }

    res.status(201).json({ success: true, data: { id: newProductId }, message: 'Product created successfully' });
  } catch (err) {
    console.error('Inventory create error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── UPDATE ─────────────────────────────────
exports.update = async (req, res) => {
  try {
    // Prices are set by HQ only (Super Admin). Others may manage stock details but not prices.
    if (req.user.role !== 'super_admin') {
      for (const f of ['cost_price', 'franchise_price', 'selling_price', 'staff_price', 'price_visible_to_staff', 'target_franchises']) delete req.body[f];
    }

    { const fe = productFieldError(req.body); if (fe) return res.status(400).json({ success: false, error: fe }); }
    const [existing] = await pool.query(`SELECT id FROM inventory WHERE id = ? AND is_deleted = 0${ownProducts(req)}`, [req.params.id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Product not found' });
    const productId = req.params.id;
    const updates = [];
    const params = [];

    const fields = [
      'product_name', 'unit', 'low_stock_threshold', 'description',
      'sku', 'barcode', 'category', 'sub_category', 'brand', 'vehicle_compatibility', 'variant',
      'cost_price', 'franchise_price', 'selling_price', 'staff_price', 'price_visible_to_staff',
      'discount_pct', 'gst_pct', 'supplier', 'purchase_date', 'purchase_invoice_no', 'warehouse_location',
      'warranty', 'serial_number', 'expiry_date', 'status'
    ];

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        params.push(req.body[f]);
      }
    }

    if (req.body.images_json !== undefined) {
      const imgVal = req.body.images_json ? (typeof req.body.images_json === 'string' ? req.body.images_json : JSON.stringify(req.body.images_json)) : null;
      updates.push('images_json = ?');
      params.push(imgVal);
    }

    if (updates.length > 0) {
      params.push(productId);
      await pool.query(`UPDATE inventory SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    // Handle target_franchises array if provided
    if (Array.isArray(req.body.target_franchises)) {
      for (const tf of req.body.target_franchises) {
        if (tf.franchise_id) {
          const fPrice = tf.franchise_price !== undefined ? parseFloat(tf.franchise_price) : parseFloat(req.body.franchise_price || 0);
          const sPrice = tf.selling_price !== undefined && tf.selling_price !== null ? parseFloat(tf.selling_price) : parseFloat(req.body.selling_price || 0);
          await pool.query(
            `INSERT INTO franchise_inventory_pricing (inventory_id, franchise_id, franchise_price, selling_price)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE franchise_price = VALUES(franchise_price), selling_price = VALUES(selling_price)`,
            [productId, tf.franchise_id, fPrice, sPrice]
          );
        }
      }
    }

    res.json({ success: true, message: 'Product updated successfully' });
  } catch (err) {
    console.error('Inventory update error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── FRANCHISE-WISE PRICING (ADMIN ONLY) ────
exports.getFranchisePricings = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT fip.*, f.name AS franchise_name, f.code AS franchise_code
       FROM franchise_inventory_pricing fip
       JOIN franchises f ON fip.franchise_id = f.id
       WHERE fip.inventory_id = ?`,
      [id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('getFranchisePricings error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.setFranchisePricing = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Only the Super Admin can set franchise prices' });
    }

    const { id } = req.params;
    const { franchise_id, franchise_price, selling_price } = req.body;

    if (!franchise_id || (franchise_price === undefined && selling_price === undefined)) {
      return res.status(400).json({ success: false, error: 'franchise_id and pricing details required' });
    }

    const fPrice = franchise_price !== undefined ? parseFloat(franchise_price) : 0;
    const sPrice = selling_price !== undefined && selling_price !== null ? parseFloat(selling_price) : null;
    if (!(fPrice >= 0) || (sPrice !== null && !(sPrice >= 0))) return res.status(400).json({ success: false, error: 'Prices must be 0 or more' });

    await pool.query(
      `INSERT INTO franchise_inventory_pricing (inventory_id, franchise_id, franchise_price, selling_price)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         franchise_price = VALUES(franchise_price),
         selling_price = COALESCE(VALUES(selling_price), selling_price)`,
      [id, franchise_id, fPrice, sPrice]
    );

    res.json({ success: true, message: 'Franchise-specific pricing updated successfully' });
  } catch (err) {
    console.error('setFranchisePricing error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── ADJUST QUANTITY (delta) ────────────────
exports.adjustQuantity = async (req, res) => {
  try {
    const { delta } = req.body;
    if (delta === undefined || delta === null) return res.status(400).json({ success: false, error: 'Delta is required' });

    const [existing] = await pool.query(`SELECT id, quantity FROM inventory WHERE id = ? AND is_deleted = 0${ownProducts(req)}`, [req.params.id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Product not found' });

    const d = parseFloat(delta);
    if (!Number.isFinite(d)) return res.status(400).json({ success: false, error: 'Enter a valid number' });
    if (Number(existing[0].quantity) + d < 0) {
      return res.status(400).json({ success: false, error: `Only ${Number(existing[0].quantity)} in stock — can't remove ${Math.abs(d)}` });
    }
    await pool.query('UPDATE inventory SET quantity = quantity + ? WHERE id = ?', [d, req.params.id]);

    const [updated] = await pool.query(
      'SELECT *, ((low_stock_threshold > 0 AND quantity <= low_stock_threshold)) AS is_low_stock FROM inventory WHERE id = ?',
      [req.params.id]
    );
    res.json({ success: true, data: { ...updated[0], is_low_stock: !!updated[0].is_low_stock }, message: 'Quantity adjusted' });
  } catch (err) {
    console.error('Inventory adjust error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── SOFT DELETE ────────────────────────────
exports.softDelete = async (req, res) => {
  try {
    const [existing] = await pool.query(`SELECT id FROM inventory WHERE id = ? AND is_deleted = 0${ownProducts(req)}`, [req.params.id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Product not found' });

    await pool.query('UPDATE inventory SET is_deleted = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    console.error('Inventory delete error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── BULK UPLOAD ────────────────────────────
exports.bulkUpload = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

  const conn = await pool.getConnection();
  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (!data.length) return res.status(400).json({ success: false, error: 'Empty file' });

    await conn.beginTransaction();
    let count = 0;

    for (const row of data) {
      const name = row['Product Name'] || row.product_name || row.name;
      const unit = row['Unit'] || row.unit || 'pcs';
      const quantity = parseInt(row['Quantity'] || row.quantity || 0, 10);
      const lowStock = parseInt(row['Low Stock Threshold'] || row.low_stock_threshold || 5, 10);
      const price = parseFloat(row['Price'] || row.price || 0);

      if (!name) continue;

      // Check if product exists
      const [existing] = await conn.query('SELECT id FROM inventory WHERE product_name = ? AND is_deleted = 0', [name]);

      if (existing.length) {
        // Update quantity (add to existing)
        await conn.query('UPDATE inventory SET quantity = quantity + ?, selling_price = ? WHERE id = ?', [quantity, price, existing[0].id]);
      } else {
        // Insert new
        await conn.query(
          'INSERT INTO inventory (product_name, unit, quantity, low_stock_threshold, selling_price, franchise_id) VALUES (?, ?, ?, ?, ?, ?)',
          [name, unit, quantity, lowStock, price, req.user?.franchise_id || 1]
        );
      }
      count++;
    }

    await conn.commit();
    res.status(201).json({ success: true, message: `Successfully imported ${count} products` });
  } catch (err) {
    await conn.rollback();
    console.error('Bulk upload error:', err);
    res.status(500).json({ success: false, error: 'Server error processing file' });
  } finally {
    conn.release();
  }
};

const fs = require('fs');
const pathModule = require('path');

exports.uploadImage = async (req, res) => {
  try {
    const files = req.files || (req.file ? [req.file] : []);
    if (!files.length) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const uploadedUrls = [];

    // Derive robust baseUrl fallback from request if SERVER_URL is missing or contains localhost in production
    let baseUrl = process.env.SERVER_URL || '';
    if (!baseUrl || (baseUrl.includes('localhost') && process.env.NODE_ENV === 'production')) {
      baseUrl = `${req.protocol}://${req.get('host')}`;
    }

    for (const file of files) {
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({ success: false, error: `Invalid file type for ${file.originalname}. Only JPG, PNG, WEBP allowed.` });
      }
      if (file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: `File ${file.originalname} is too large. Max 10MB.` });
      }

      let photoUrl = '';
      let publicId = null;

      // Try Cloudinary first if configured
      if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
        try {
          const cloudinary = require('../config/cloudinary');
          const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { folder: 'o3-car-spaa/inventory-photos', resource_type: 'image' },
              (err, res) => { if (err) reject(err); else resolve(res); }
            );
            stream.end(file.buffer);
          });
          photoUrl = result.secure_url;
          publicId = result.public_id;
          console.log('[STORAGE] Uploaded inventory image to Cloudinary:', photoUrl);
        } catch (cloudErr) {
          console.warn('[STORAGE] Cloudinary upload failed, falling back to local disk:', cloudErr.message);
        }
      } else {
        console.log('[STORAGE] Cloudinary credentials not set. Using local disk storage fallback.');
      }

      // Fallback: Save to local disk
      if (!photoUrl) {
        const uploadsDir = pathModule.join(__dirname, '..', '..', 'uploads', 'products');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const ext = pathModule.extname(file.originalname) || '.jpg';
        const safeName = file.originalname
          .replace(ext, '')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .substring(0, 50);
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${safeName}${ext}`;
        const filePath = pathModule.join(uploadsDir, fileName);

        fs.writeFileSync(filePath, file.buffer);
        photoUrl = `${baseUrl}/uploads/products/${fileName}`;
      }

      uploadedUrls.push(photoUrl);
    }

    res.status(201).json({
      success: true,
      url: uploadedUrls[0],
      urls: uploadedUrls,
      message: `Uploaded ${uploadedUrls.length} image(s) successfully`
    });
  } catch (err) {
    console.error('Inventory photo upload error:', err);
    res.status(500).json({ success: false, error: 'Failed to upload image' });
  }
};

// ─── BULK DELETE ─────────────────────────────
exports.bulkDelete = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Product IDs array required' });
    }
    const [r] = await pool.query(`UPDATE inventory SET is_deleted = 1 WHERE id IN (?)${ownProducts(req)}`, [ids]);
    if (r.affectedRows < ids.length) return res.status(r.affectedRows ? 207 : 404).json({ success: r.affectedRows > 0, error: `${ids.length - r.affectedRows} of these products are not your studio's and were not changed`, changed: r.affectedRows });
    res.json({ success: true, message: `${ids.length} products deleted successfully` });
  } catch (err) {
    console.error('Bulk delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete products' });
  }
};

// ─── BULK UPDATE CATEGORY ────────────────────
exports.bulkUpdateCategory = async (req, res) => {
  try {
    const { ids, category } = req.body;
    if (!Array.isArray(ids) || ids.length === 0 || !category) {
      return res.status(400).json({ success: false, error: 'IDs array and category string required' });
    }
    const [r] = await pool.query(`UPDATE inventory SET category = ? WHERE id IN (?)${ownProducts(req)}`, [category, ids]);
    if (r.affectedRows < ids.length) return res.status(r.affectedRows ? 207 : 404).json({ success: r.affectedRows > 0, error: `${ids.length - r.affectedRows} of these products are not your studio's and were not changed`, changed: r.affectedRows });
    res.json({ success: true, message: `Category updated to "${category}" for ${ids.length} products` });
  } catch (err) {
    console.error('Bulk update category error:', err);
    res.status(500).json({ success: false, error: 'Failed to update category' });
  }
};

// ─── BULK UPDATE STATUS ──────────────────────
exports.bulkUpdateStatus = async (req, res) => {
  try {
    const { ids, status } = req.body;
    if (status && !['active', 'inactive'].includes(status)) return res.status(400).json({ success: false, error: 'Status must be active or inactive' });
    if (!Array.isArray(ids) || ids.length === 0 || !status) {
      return res.status(400).json({ success: false, error: 'IDs array and status required' });
    }
    const [r] = await pool.query(`UPDATE inventory SET status = ? WHERE id IN (?)${ownProducts(req)}`, [status, ids]);
    if (r.affectedRows < ids.length) return res.status(r.affectedRows ? 207 : 404).json({ success: r.affectedRows > 0, error: `${ids.length - r.affectedRows} of these products are not your studio's and were not changed`, changed: r.affectedRows });
    res.json({ success: true, message: `Status updated to "${status}" for ${ids.length} products` });
  } catch (err) {
    console.error('Bulk update status error:', err);
    res.status(500).json({ success: false, error: 'Failed to update status' });
  }
};

// ─── GET CATEGORIES ──────────────────────────
exports.getCategories = async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const franchiseId = req.headers['x-franchise-id'] ? parseInt(req.headers['x-franchise-id'], 10) : 1;
    let countWhere = "category IS NOT NULL AND category != '' AND is_deleted = 0";
    const countParams = [];
    if (franchiseId && franchiseId !== 1) {
      countWhere += " AND (franchise_id = ? OR id IN (SELECT inventory_id FROM franchise_inventory_pricing WHERE franchise_id = ?))";
      countParams.push(franchiseId, franchiseId);
    } else {
      countWhere += " AND (franchise_id = 1 OR franchise_id IS NULL)";
    }

    // Fetch master categories list and distinct inventory categories safely
    const [dbCats] = await pool.query('SELECT name FROM inventory_categories ORDER BY name ASC');
    const [invCats] = await pool.query(`SELECT DISTINCT category AS name FROM inventory WHERE ${countWhere}`, countParams);
    const [countsRows] = await pool.query(`SELECT category, COUNT(id) AS cnt FROM inventory WHERE ${countWhere} GROUP BY category`, countParams);

    const countsMap = {};
    (countsRows || []).forEach(r => {
      if (r.category) countsMap[r.category.trim().toLowerCase()] = Number(r.cnt || 0);
    });

    const categoryMap = new Map();
    (dbCats || []).forEach(c => {
      if (c.name && c.name.trim()) {
        const key = c.name.trim().toLowerCase();
        categoryMap.set(key, { category: c.name.trim(), count: countsMap[key] || 0 });
      }
    });

    (invCats || []).forEach(c => {
      if (c.name && c.name.trim()) {
        const key = c.name.trim().toLowerCase();
        if (!categoryMap.has(key)) {
          categoryMap.set(key, { category: c.name.trim(), count: countsMap[key] || 0 });
        }
      }
    });

    const result = Array.from(categoryMap.values()).sort((a, b) => a.category.localeCompare(b.category));
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Get categories error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch categories' });
  }
};

// ─── CREATE CATEGORY ─────────────────────────
exports.createCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Category name required' });
    }
    const categoryName = name.trim();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(
      'INSERT INTO inventory_categories (name) VALUES (?) ON DUPLICATE KEY UPDATE name = VALUES(name)',
      [categoryName]
    );

    res.status(201).json({ success: true, message: `Category "${categoryName}" created successfully` });
  } catch (err) {
    console.error('Create category error:', err);
    res.status(500).json({ success: false, error: 'Failed to create category' });
  }
};

// ─── RENAME CATEGORY ─────────────────────────
exports.renameCategory = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { old_name, new_name } = req.body;
    if (!old_name || !new_name || !old_name.trim() || !new_name.trim()) {
      return res.status(400).json({ success: false, error: 'Old name and new name required' });
    }
    await conn.beginTransaction();
    const oldCat = old_name.trim();
    const newCat = new_name.trim();

    // Update categories master table
    await conn.query(
      'INSERT INTO inventory_categories (name) VALUES (?) ON DUPLICATE KEY UPDATE name = VALUES(name)',
      [newCat]
    );
    await conn.query('DELETE FROM inventory_categories WHERE name = ?', [oldCat]);

    // Cascade rename to inventory items
    const [result] = await conn.query(
      'UPDATE inventory SET category = ? WHERE category = ? AND is_deleted = 0',
      [newCat, oldCat]
    );

    await conn.commit();
    res.json({
      success: true,
      message: `Renamed category "${oldCat}" to "${newCat}" across ${result.affectedRows} product(s)`
    });
  } catch (err) {
    await conn.rollback();
    console.error('Rename category error:', err);
    res.status(500).json({ success: false, error: 'Failed to rename category' });
  } finally {
    conn.release();
  }
};

// ─── DELETE CATEGORY ─────────────────────────
exports.deleteCategory = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { name, reassign_to } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Category name required' });
    }
    const targetCategory = name.trim();

    await conn.beginTransaction();

    const [inUse] = await conn.query(
      'SELECT COUNT(*) AS cnt FROM inventory WHERE category = ? AND is_deleted = 0',
      [targetCategory]
    );
    const activeCount = inUse[0]?.cnt || 0;

    if (activeCount > 0 && (!reassign_to || !reassign_to.trim())) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        error: `Category "${targetCategory}" is currently assigned to ${activeCount} product(s). Select a target category to reassign them.`
      });
    }

    if (activeCount > 0 && reassign_to) {
      const reassignName = reassign_to.trim();
      await conn.query(
        'UPDATE inventory SET category = ? WHERE category = ? AND is_deleted = 0',
        [reassignName, targetCategory]
      );
    }

    // Delete from categories master table
    await conn.query('DELETE FROM inventory_categories WHERE name = ?', [targetCategory]);

    await conn.commit();
    res.json({ success: true, message: `Category "${targetCategory}" deleted successfully` });
  } catch (err) {
    await conn.rollback();
    console.error('Delete category error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete category' });
  } finally {
    conn.release();
  }
};

