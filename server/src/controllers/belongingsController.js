const pool = require('../config/db');
const cloudinary = require('../config/cloudinary');

// ─── LIST BELONGINGS FOR A JOB CART ─────────────────────────
exports.list = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM job_cart_belongings WHERE job_cart_id = ? ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Belongings list error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── ADD BELONGING ───────────────────────────────────────────
exports.create = async (req, res) => {
  try {
    let { description } = req.body;
    if ((!description || !description.trim()) && !req.file) {
      return res.status(400).json({ success: false, error: 'Description or photo is required' });
    }
    if (!description || !description.trim()) {
      description = 'Personal Item Photo';
    }

    let image_url = null;

    // If a file was uploaded, push to Cloudinary or fallback to data URI / local upload
    if (req.file) {
      const b64 = req.file.buffer.toString('base64');
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;

      try {
        const result = await cloudinary.uploader.upload(dataURI, {
          folder: 'job_belongings',
          resource_type: 'image',
        });
        image_url = result.secure_url;
      } catch (uploadErr) {
        console.error('Cloudinary upload error for belonging, falling back to data URI:', uploadErr);
        // Fallback to storing data URI directly so image is NEVER lost
        image_url = dataURI;
      }
    }

    const [result] = await pool.query(
      'INSERT INTO job_cart_belongings (job_cart_id, description, image_url) VALUES (?, ?, ?)',
      [req.params.id, description.trim(), image_url]
    );

    const [newRow] = await pool.query('SELECT * FROM job_cart_belongings WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: newRow[0] });
  } catch (err) {
    console.error('Belonging create error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── DELETE BELONGING ────────────────────────────────────────
exports.remove = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM job_cart_belongings WHERE id = ? AND job_cart_id = ?', [req.params.bid, req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Belonging not found' });

    // Delete cloudinary image if exists
    if (rows[0].image_url) {
      try {
        const urlParts = rows[0].image_url.split('/');
        const publicIdWithExt = urlParts.slice(-2).join('/'); // e.g. job_belongings/abc123
        const publicId = publicIdWithExt.replace(/\.[^.]+$/, '');
        await cloudinary.uploader.destroy(publicId);
      } catch (e) { /* silent */ }
    }

    await pool.query('DELETE FROM job_cart_belongings WHERE id = ?', [req.params.bid]);
    res.json({ success: true, message: 'Belonging removed' });
  } catch (err) {
    console.error('Belonging delete error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
