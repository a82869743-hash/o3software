const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/paymentsController');

router.get('/pending-reminders', auth, role(['admin']), ctrl.getPendingReminders);
router.get('/', auth, role(['admin']), ctrl.getPayments);
router.get('/stats', auth, role(['admin']), ctrl.getPaymentStats);
router.get('/advances', auth, role(['admin']), ctrl.getAdvancePayments);
router.get('/wallet/:customer_id', auth, ctrl.getWalletBalance);
router.post('/', auth, role(['admin','staff']), ctrl.createPayment);
router.post('/advance', auth, role(['admin','staff']), ctrl.createAdvancePayment);
router.post('/refund', auth, role(['admin']), ctrl.createRefund);
router.get('/:id/invoice', auth, ctrl.downloadInvoice);
router.post('/razorpay/order', auth, role(['admin','staff','customer']), ctrl.createRazorpayOrder);
router.post('/razorpay/verify', auth, role(['admin','staff','customer']), ctrl.verifyRazorpayPayment);
router.post('/:id/remind', auth, role(['admin','staff']), ctrl.sendReminder);
router.post('/qr-confirm', auth, role(['admin','staff','customer']), ctrl.confirmQrPayment);

module.exports = router;
