const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { protect, authorize } = require('../middleware/auth');

// Admin dashboard stats
router.get('/stats', protect, authorize('admin'), dashboardController.getStats);

// Customer dashboard (aggregated)
router.get('/customer', protect, authorize('customer'), dashboardController.getCustomerDashboard);

module.exports = router;
