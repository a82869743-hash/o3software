const router = require('express').Router();

// Import middleware correctly
const { protect } = require('../middleware/auth');
const role = require('../middleware/role');

// Import controller
const loyaltyController = require('../controllers/loyaltyController');

// ─── Customer routes ─────────────────────────
router.get('/mine',          protect, role(['customer']), loyaltyController.get);
router.get('/mine/history',  protect, role(['customer']), loyaltyController.history);

// ─── Admin routes ────────────────────────────
router.get('/search',        protect, role(['admin']), loyaltyController.search);
router.get('/settings',      protect, role(['admin']), loyaltyController.getSettings);
router.patch('/settings',    protect, role(['admin']), loyaltyController.updateSettings);
router.get('/:customerId',           protect, role(['admin']), loyaltyController.get);
router.get('/:customerId/history',   protect, role(['admin']), loyaltyController.history);
router.patch('/:customerId',         protect, role(['admin']), loyaltyController.update);

// ─── Points operations ──────────────────────
router.post('/earn',         protect, role(['admin']), loyaltyController.earnPoints);
router.post('/redeem',       protect, role(['admin', 'customer']), loyaltyController.redeemPoints);
router.post('/redeem-wash',  protect, role(['admin', 'customer']), loyaltyController.redeemPointsToWash);

module.exports = router;
