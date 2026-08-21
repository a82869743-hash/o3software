const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const settingsController = require('../controllers/settingsController');
const { protect, authorize } = require('../middleware/auth');

// Configure Multer storage for QR upload
const qrStorageDir = path.join(__dirname, '..', '..', 'uploads', 'qr');
if (!fs.existsSync(qrStorageDir)) {
  fs.mkdirSync(qrStorageDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, qrStorageDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `admin_upi_qr_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Public route for fetching active studio settings & payment QR info (used during customer checkout)
router.get('/public', settingsController.getPublicSettings);

// Protected route for Admin to read settings
router.get('/', protect, authorize('admin'), settingsController.getAll);

// Protected route for Admin to update settings
router.patch('/', protect, authorize('admin'), settingsController.updateAll);

// Protected route for Admin to upload custom UPI Payment QR Image
// Payment QR Management Routes
router.get('/payment-qrs', protect, authorize('admin'), settingsController.listPaymentQrs);
router.post('/payment-qrs', protect, authorize('admin'), settingsController.createPaymentQr);
router.post('/payment-qrs/:id/set-active', protect, authorize('admin'), settingsController.setActivePaymentQr);
router.delete('/payment-qrs/:id', protect, authorize('admin'), settingsController.deletePaymentQr);

module.exports = router;
