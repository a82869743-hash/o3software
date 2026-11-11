const pool = require('../config/db');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateInvoicePDF } = require('../services/invoiceService');

// ─── SECURITY HELPERS ──────────────────────────────
const PUBLIC_ROOT = path.resolve(__dirname, '../../public');
const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isSafeUrl(url) {
  if (!url) return false;
  const trimmed = String(url).trim().toLowerCase();
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('vbscript:')) {
    return false;
  }
  return trimmed.startsWith('/') || trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

function resolveSafeLocalPath(rawRelativePath) {
  if (!rawRelativePath || typeof rawRelativePath !== 'string') return null;
  if (rawRelativePath.includes('\0')) return null;

  const normalized = path.normalize(rawRelativePath).replace(/^[\\\/]+/, '');

  // Check public root first
  const resolvedPublic = path.resolve(PUBLIC_ROOT, normalized);
  if (resolvedPublic.startsWith(PUBLIC_ROOT) && fs.existsSync(resolvedPublic)) {
    return resolvedPublic;
  }

  // Check uploads root
  const uploadsRelative = normalized.startsWith('uploads')
    ? normalized.replace(/^uploads[\\\/]+/, '')
    : normalized;
  const resolvedUploads = path.resolve(UPLOADS_ROOT, uploadsRelative);
  if (resolvedUploads.startsWith(UPLOADS_ROOT) && fs.existsSync(resolvedUploads)) {
    return resolvedUploads;
  }

  return null;
}

// ─── LIST SHARED FILES ──────────────────────────────
exports.list = async (req, res) => {
  try {
    const { entity_type, entity_id, customer_id } = req.query;
    let where = '1=1';
    const params = [];

    if (entity_type) { where += ' AND sf.entity_type = ?'; params.push(entity_type); }
    if (entity_id) { where += ' AND sf.entity_id = ?'; params.push(entity_id); }
    const role = req.user?.role;
    if (role === 'customer') {
      // customers only ever see files explicitly shared on their own job cards
      where += ' AND sf.shared_with_customer = 1 AND jv.customer_id = ?';
      params.push(req.user.id);
    } else {
      if (customer_id) {
        where += ' AND sf.shared_with_customer = 1 AND jv.customer_id = ?';
        params.push(customer_id);
      }
      if (role !== 'super_admin') {
        where += ' AND (jc.franchise_id = ? OR (jc.id IS NULL AND u.franchise_id = ?))';
        params.push(req.user.franchise_id, req.user.franchise_id);
      }
    }

    const query = `
      SELECT sf.*, u.name as uploader_name
      FROM shared_files sf
      LEFT JOIN users u ON u.id = sf.uploaded_by
      LEFT JOIN job_carts jc ON jc.id = sf.entity_id AND sf.entity_type = 'job_cart'
      LEFT JOIN vehicles jv ON jv.id = jc.vehicle_id
      WHERE ${where}
      ORDER BY sf.created_at DESC
    `;
    const [rows] = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Shared files list error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── UPLOAD FILE ────────────────────────────────────
exports.upload = async (req, res) => {
  try {
    const { entity_type, entity_id, shared_with_customer } = req.body;
    if (!req.file) return res.status(400).json({ success: false, error: 'No file provided' });

    const share_token = crypto.randomBytes(16).toString('hex');
    const fileUrl = `/uploads/shared/${req.file.filename}`;

    const [result] = await pool.query(
      `INSERT INTO shared_files (uploaded_by, entity_type, entity_id, file_name, file_path, file_type, file_size, shared_with_customer, share_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, entity_type || 'general', entity_id || null, req.file.originalname, fileUrl, req.file.mimetype, req.file.size, shared_with_customer === 'true' ? 1 : 0, share_token]
    );

    res.status(201).json({ success: true, data: { id: result.insertId, fileUrl, share_token }, message: 'File uploaded' });
  } catch (err) {
    console.error('File upload error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── DELETE FILE ────────────────────────────────────
exports.delete = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM shared_files WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'File not found' });

    // Franchise check: non-super users may only touch files of their own franchise
    if (req.user.role !== 'super_admin') {
      const [[own]] = await pool.query(
        `SELECT COALESCE(jc.franchise_id, u.franchise_id) AS fid FROM shared_files sf
         LEFT JOIN job_carts jc ON jc.id = sf.entity_id AND sf.entity_type = 'job_cart'
         LEFT JOIN users u ON u.id = sf.uploaded_by WHERE sf.id = ?`, [req.params.id]);
      if (!own || Number(own.fid) !== Number(req.user.franchise_id)) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }
    }

    // Ownership check: Only uploader or admin can delete file
    if (!['admin', 'super_admin'].includes(req.user.role) && existing[0].uploaded_by !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied — Cannot delete a file uploaded by another user' });
    }

    const safePath = resolveSafeLocalPath(existing[0].file_path);
    if (safePath && fs.existsSync(safePath)) {
      fs.unlinkSync(safePath);
    }

    await pool.query('DELETE FROM shared_files WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'File deleted' });
  } catch (err) {
    console.error('File delete error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── PUBLIC DOWNLOAD BY TOKEN ───────────────────────
exports.downloadByToken = async (req, res) => {
  try {
    const { token } = req.params;
    const [rows] = await pool.query('SELECT * FROM shared_files WHERE share_token = ? AND shared_with_customer = 1', [token]);
    
    if (!rows.length) return res.status(404).send('File not found or access denied');
    
    const file = rows[0];
    const safePath = resolveSafeLocalPath(file.file_path);
    
    if (!safePath) return res.status(404).send('File missing on server or invalid path');
    
    res.download(safePath, path.basename(file.file_name || 'download'));
  } catch (err) {
    console.error('File download error:', err);
    res.status(500).send('Server error');
  }
};

// ─── GENERATE CRYPTO SHARE LINK (Update 22) ───────────
exports.generateLink = async (req, res) => {
  try {
    const { file_name, file_url, file_type, reference_type, reference_id, expiry_hours } = req.body;
    if (!file_url || !file_name) {
      return res.status(400).json({ success: false, error: 'File URL and Name are required' });
    }

    const shareToken = crypto.randomBytes(32).toString('hex');
    let expiresAt = null;
    if (expiry_hours) {
      expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + parseInt(expiry_hours));
    }

    // Insert into v2_file_attachments
    await pool.query(
      `INSERT INTO v2_file_attachments (file_name, file_url, file_type, reference_type, reference_id, share_token, share_expires_at, share_created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [file_name, file_url, file_type || 'image', reference_type || 'general', reference_id || null, shareToken, expiresAt, req.user.id]
    );

    const shareUrl = `${req.protocol}://${req.get('host')}/api/shared/${shareToken}`;

    res.json({
      success: true,
      data: {
        share_token: shareToken,
        share_url: shareUrl,
        expires_at: expiresAt
      }
    });
  } catch (err) {
    console.error('generateLink error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate share link' });
  }
};

// ─── RESOLVE CRYPTO SHARE LINK (Update 22) ───────────
exports.getSharedFile = async (req, res) => {
  try {
    const { token } = req.params;
    const [rows] = await pool.query(
      `SELECT * FROM v2_file_attachments WHERE share_token = ?`,
      [token]
    );

    if (!rows.length) {
      return res.status(404).send('<h1>Link Invalid or Expired</h1><p>The shareable link you are trying to access is invalid.</p>');
    }

    const file = rows[0];

    // Check expiry
    if (file.share_expires_at && new Date(file.share_expires_at) < new Date()) {
      return res.status(410).send('<h1>Link Expired</h1><p>This shareable link has expired.</p>');
    }

    if (file.reference_type === 'invoice') {
      try {
        const { pdfBuffer } = await generateInvoicePDF(file.reference_id);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${file.file_name}"`);
        return res.send(pdfBuffer);
      } catch (pdfErr) {
        console.error('Dynamic PDF generation failed:', pdfErr);
        return res.status(500).send('Failed to compile invoice PDF');
      }
    }

    const isPdf = file.file_type === 'pdf' || (file.file_name && file.file_name.toLowerCase().endsWith('.pdf'));
    const isImage = file.file_type === 'image' || ['jpg', 'jpeg', 'png', 'webp', 'gif'].some(ext => file.file_url.toLowerCase().endsWith('.' + ext));

    if (isPdf) {
      if (file.file_url.startsWith('http://') || file.file_url.startsWith('https://')) {
        return res.redirect(file.file_url);
      }
      const safePath = resolveSafeLocalPath(file.file_url);
      if (safePath) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${escapeHtml(path.basename(file.file_name))}"`);
        return res.sendFile(safePath);
      }
      return res.status(404).send('File not found on server.');
    } else if (isImage) {
      const safeUrl = isSafeUrl(file.file_url) ? escapeHtml(file.file_url) : '#';
      const safeName = escapeHtml(file.file_name || 'Shared Image');
      return res.send(`
        <html>
        <head>
          <title>${safeName} - Shared via O3 Car Spaa</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              margin: 0;
              padding: 0;
              background: radial-gradient(circle at top, #1a1a1a, #0d0d0d);
              height: 100vh;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              font-family: 'Manrope', Arial, sans-serif;
              color: white;
            }
            .preview-container {
              background: rgba(255, 255, 255, 0.03);
              backdrop-filter: blur(16px);
              border: 1px solid rgba(255, 255, 255, 0.1);
              padding: 24px;
              border-radius: 24px;
              max-width: 90%;
              max-height: 80vh;
              box-shadow: 0 20px 40px rgba(0,0,0,0.5);
              display: flex;
              flex-direction: column;
              align-items: center;
            }
            img {
              max-width: 100%;
              max-height: 60vh;
              border-radius: 12px;
              object-fit: contain;
              border: 1px solid rgba(255,255,255,0.05);
            }
            .title {
              margin-top: 16px;
              font-size: 16px;
              font-weight: 600;
              color: rgba(255,255,255,0.9);
            }
            .subtitle {
              font-size: 12px;
              color: rgba(255,255,255,0.4);
              margin-top: 4px;
            }
            .btn {
              margin-top: 20px;
              background: linear-gradient(135deg, #10b981, #059669);
              border: none;
              color: white;
              padding: 10px 24px;
              border-radius: 12px;
              font-weight: 600;
              cursor: pointer;
              text-decoration: none;
              font-size: 13px;
              box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
              transition: transform 0.2s;
            }
            .btn:hover {
              transform: translateY(-2px);
            }
          </style>
        </head>
        <body>
          <div class="preview-container">
            <img src="${safeUrl}" alt="${safeName}" />
            <div class="title">${safeName}</div>
            <div class="subtitle">Shared from O3 Car Spaa Studio</div>
            <a href="${safeUrl}" download="${safeName}" class="btn">Download Original Image</a>
          </div>
        </body>
        </html>
      `);
    } else {
      if (isSafeUrl(file.file_url)) {
        return res.redirect(file.file_url);
      }
      return res.status(400).send('Invalid file URL');
    }
  } catch (err) {
    console.error('getSharedFile error:', err);
    res.status(500).send('Server Error');
  }
};
