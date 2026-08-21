const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/bookingsController');

// Vehicle history (admin only) — must be before /:id routes
router.get('/vehicle-history/:regNo', auth, role(['admin']), ctrl.vehicleHistory);

router.get('/',           auth, role(['admin', 'customer']), ctrl.list);
router.get('/first-wash-eligibility', auth, role(['admin', 'customer']), ctrl.firstWashEligibility);
router.get('/pending',    auth, role(['admin']), ctrl.listPending);
router.get('/:id',        auth, role(['admin', 'customer']), ctrl.getOne);
router.get('/:id/invoice', auth, role(['admin', 'customer']), ctrl.downloadInvoice);
router.post('/manual',    auth, role(['admin']), ctrl.createManual);
router.post('/',          auth, role(['customer', 'admin']), ctrl.create);
router.patch('/:id/cancel', auth, role(['admin', 'customer']), ctrl.cancel);

// ─── Approval Workflow (Admin only) ─────────────────────
router.patch('/:id/approve', auth, role(['admin']), ctrl.approve);
router.patch('/:id/reject',  auth, role(['admin']), ctrl.reject);

// ─── Service Update Workflow (Customer & Admin) ──────────
router.get('/:id/can-change', auth, role(['admin', 'customer']), ctrl.canChange);
router.patch('/:id/change-services', auth, role(['admin', 'customer']), ctrl.changeServices);

module.exports = router;
