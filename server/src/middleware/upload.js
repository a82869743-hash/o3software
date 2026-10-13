/**
 * upload.js — Multi-Driver Storage Middleware (Local Disk / Cloudinary)
 * Controlled via STORAGE_DRIVER=cloudinary|local environment variable.
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ── 1. Local Disk Storage Configuration ──────────────────────────────────────
const UPLOAD_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads');

function getUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
}

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, getUploadDir()),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const randomHex = crypto.randomBytes(12).toString('hex');
    const safeName = `upload_${Date.now()}_${randomHex}${ext}`;
    cb(null, safeName);
  }
});

// ── 2. Cloudinary Storage Configuration ───────────────────────────────────────
let activeStorage = diskStorage;
const isCloudinaryConfigured = process.env.STORAGE_DRIVER === 'cloudinary' &&
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET;

if (isCloudinaryConfigured) {
  try {
    const cloudinary = require('cloudinary').v2;
    const { CloudinaryStorage } = require('multer-storage-cloudinary');

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });

    activeStorage = new CloudinaryStorage({
      cloudinary,
      params: {
        folder: 'o3_car_spaa/uploads',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'pdf']
      }
    });
    console.log('[Storage] ☁️ Using Cloudinary storage driver.');
  } catch (err) {
    console.warn('[Storage] ⚠️ Cloudinary initialization failed, falling back to local disk storage:', err.message);
    activeStorage = diskStorage;
  }
} else {
  console.log('[Storage] 💾 Using local persistent disk storage driver.');
}

// ── 3. File Type Whitelist & Security Checks ──────────────────────────────────
const fileFilter = (req, file, cb) => {
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedExts.includes(ext) && allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file format. Only JPEG, PNG, WEBP, and PDF files are allowed.'));
  }
};

const uploadMiddleware = multer({
  storage: activeStorage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max to match Nginx client_max_body_size
});

module.exports = uploadMiddleware;
