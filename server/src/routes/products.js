const router = require('express').Router();
require('../middleware/numericIds')(router, ['id']);
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/productsController');

// Customer routes
router.get('/', auth, role(['customer', 'admin', 'staff']), ctrl.listCustomerProducts);
router.post('/order', auth, role(['customer', 'admin', 'staff']), ctrl.createOrder);
router.post('/orders', auth, role(['customer', 'admin', 'staff']), ctrl.createOrder);
router.get('/my-orders', auth, role(['customer', 'admin', 'staff']), ctrl.listMyOrders);

// Admin routes
router.get('/orders', auth, role(['admin']), ctrl.listOrders);
router.post('/orders/:id/confirm', auth, role(['admin']), ctrl.confirmQrOrder);
router.post('/orders/:id/reject', auth, role(['admin']), ctrl.rejectOrder);
router.post('/orders/:id/collected', auth, role(['admin']), ctrl.markCollected);

module.exports = router;
