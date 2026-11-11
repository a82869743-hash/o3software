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
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, `upi_qr_${Date.now()}_${require('crypto').randomBytes(6).toString('hex')}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|webp)$/.test(file.mimetype) && /\.(png|jpe?g|webp)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const superAdmin = require('../middleware/superAdmin');
const { optionalAuth } = require('../middleware/auth');

// Public studio details + active payment QR (customer checkout, invoices, job cards)
router.get('/public', optionalAuth, settingsController.getPublicSettings);
router.get('/qr.png', optionalAuth, settingsController.qrImage);

// Studio settings (franchise scoped)
router.get('/', protect, authorize('admin'), settingsController.getAll);
router.patch('/', protect, authorize('admin'), settingsController.updateAll);

// Payment QR management
router.get('/payment-qrs', protect, authorize('admin'), settingsController.listPaymentQrs);
router.post('/payment-qrs', protect, authorize('admin'), settingsController.createPaymentQr);
router.post('/payment-qrs/:id/set-active', protect, authorize('admin'), settingsController.setActivePaymentQr);
router.delete('/payment-qrs/:id', protect, authorize('admin'), settingsController.deletePaymentQr);
router.post('/qr-upload', protect, authorize('admin'), upload.single('qr_image'), settingsController.uploadQrCode);
// Customer-app home banner / offer popup picture (stored next to the QR images)
router.get('/invoice-preview', protect, authorize('admin'), settingsController.invoicePreview);
router.post('/banner-upload', protect, authorize('admin'), upload.single('image'), settingsController.uploadBanner);

// Price visibility matrix — Super Admin only
router.get('/price-visibility', protect, superAdmin, settingsController.getPriceVisibility);
router.put('/price-visibility', protect, superAdmin, settingsController.updatePriceVisibility);

module.exports = router;
