const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/auth');

// Public or authenticated routes
// Logs & Resend: accessible to admin/staff
router.get('/logs', protect, authorize('admin', 'staff'), notificationController.getLogs);
router.post('/logs/:id/resend', protect, authorize('admin', 'staff'), notificationController.resend);

// Warranties
router.get('/warranties', protect, notificationController.getWarranties);
router.get('/warranties/:id', protect, notificationController.getWarrantyById);

// Testing & Summary
router.post('/test-send', protect, authorize('admin'), notificationController.testSend);
router.get('/stats', protect, authorize('admin', 'staff'), notificationController.getStats);

module.exports = router;
