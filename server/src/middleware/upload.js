/**
 * Local file upload middleware using multer (disk storage).
 * Used for profile pictures when Cloudinary is not configured.
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure persistent uploads directory exists outside client bundle
const UPLOAD_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads');

function getUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, getUploadDir()),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `profile_${req.user?.id || 'unknown'}_${Date.now()}${ext}`;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts.includes(ext) && allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpg, jpeg, png, webp)'));
  }
};

const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

module.exports = uploadMiddleware;
