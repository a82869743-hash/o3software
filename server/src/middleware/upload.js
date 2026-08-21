/**
 * Local file upload middleware using multer (disk storage).
 * Used for profile pictures when Cloudinary is not configured.
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'client', 'dist', 'uploads');
const UPLOAD_DIR_DEV = path.join(__dirname, '..', '..', 'uploads');

function getUploadDir() {
  const dir = process.env.NODE_ENV === 'production' ? UPLOAD_DIR : UPLOAD_DIR_DEV;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
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
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error('Only image files are allowed (jpg, jpeg, png, webp)'));
};

const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

module.exports = uploadMiddleware;
