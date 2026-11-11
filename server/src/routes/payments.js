const router = require('express').Router();
require('../middleware/numericIds')(router, ['id', 'jobCartId', 'bookingId']);
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/paymentsController');

router.get('/pending-reminders', auth, role(['admin']), ctrl.getPendingReminders);
router.post('/pending-reminders/:jobCartId/sent', auth, role(['admin']), ctrl.markPaymentReminded);
router.get('/', auth, role(['admin']), ctrl.getPayments);
router.get('/stats', auth, role(['admin']), ctrl.getPaymentStats);
router.get('/refunds-due', auth, role(['admin']), ctrl.getRefundsDue);
router.post('/refunds/:bookingId/done', auth, role(['admin']), ctrl.markRefunded);
router.get('/advances', auth, role(['admin']), ctrl.getAdvancePayments);
router.post('/advances/:id/collect', auth, role(['admin']), ctrl.collectAdvanceBalance);
router.get('/wallet/:customer_id', auth, ctrl.getWalletBalance);
router.post('/', auth, role(['admin','staff']), ctrl.createPayment);
router.post('/advance', auth, role(['admin','staff']), ctrl.createAdvancePayment);
router.post('/refund', auth, role(['admin']), ctrl.createRefund);
router.get('/:id/invoice', auth, ctrl.downloadInvoice);
router.post('/:id/remind', auth, role(['admin','staff']), ctrl.sendReminder);
router.post('/qr-confirm', auth, role(['admin','staff','customer']), ctrl.confirmQrPayment);
router.post('/:id/qr-verify', auth, role(['admin']), ctrl.verifyQrPayment); // studio checked the bank: confirm or reject

module.exports = router;
