const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/staffController');

// Staff self-service routes (must be before /:id routes)
router.get('/my-payments',    auth, role(['staff']), ctrl.getMyPayments);
router.post('/check-in',      auth, role(['staff']), ctrl.checkIn);
router.post('/check-out',     auth, role(['staff']), ctrl.checkOut);
router.get('/premises',       auth, ctrl.getPremises);
router.put('/premises',       auth, role(['admin']), ctrl.updatePremises);
router.get('/my-attendance',  auth, role(['staff']), ctrl.getMyAttendance);

router.get('/all-attendance',    auth, role(['admin']), ctrl.getAllAttendanceSummary);
router.get('/attendance/summary', auth, role(['admin']), ctrl.getAllAttendanceSummary);
router.get('/technicians',       auth, role(['staff']), ctrl.technicians);
router.post('/:id/reset-password', auth, role(['admin']), ctrl.resetPassword);
router.patch('/:id/status',      auth, role(['admin']), ctrl.toggleStatus);
router.get('/',                  auth, role(['admin']), ctrl.list);
router.get('/:id',            auth, role(['admin']), ctrl.getOne);
router.post('/',              auth, role(['admin']), ctrl.create);
router.put('/:id',            auth, role(['admin']), ctrl.update);
router.post('/:id/attendance', auth, role(['admin']), ctrl.markAttendance);
router.get('/:id/attendance',  auth, role(['admin']), ctrl.getAttendance);
router.post('/:id/payment',   auth, role(['admin']), ctrl.addPayment);
router.get('/:id/payments',   auth, role(['admin']), ctrl.getPayments);
router.patch('/:id/payment/:pid/complete', auth, role(['admin']), ctrl.completePayment);

module.exports = router;

