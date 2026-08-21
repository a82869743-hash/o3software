const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/productsController');

// Customer routes
router.get('/', auth, role(['customer', 'admin', 'staff']), ctrl.listCustomerProducts);
router.post('/order', auth, role(['customer', 'admin', 'staff']), ctrl.createOrder);
router.post('/orders', auth, role(['customer', 'admin', 'staff']), ctrl.createOrder);
router.post('/order/verify', auth, role(['customer', 'admin', 'staff']), ctrl.verifyPayment);
router.get('/my-orders', auth, role(['customer', 'admin', 'staff']), ctrl.listMyOrders);

// Admin routes
router.get('/orders', auth, role(['admin']), ctrl.listOrders);
router.post('/orders/:id/confirm', auth, role(['admin']), ctrl.confirmQrOrder);
router.post('/orders/:id/reject', auth, role(['admin']), ctrl.rejectOrder);

module.exports = router;
