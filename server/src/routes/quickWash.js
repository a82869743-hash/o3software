const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/quickWashController');

// Quick wash routes (admin/staff only)
router.get('/',             auth, role(['admin', 'staff']), ctrl.list);
router.get('/stats',        auth, role(['admin', 'staff']), ctrl.queueStats);
router.post('/',            auth, role(['admin', 'staff']), ctrl.create);
router.get('/:id/invoice',  auth, role(['admin', 'staff', 'customer']), ctrl.getInvoice); // customer: own finished wash only
router.patch('/:id/status', auth, role(['admin', 'staff']), ctrl.updateStatus);
router.put('/:id/status',   auth, role(['admin', 'staff']), ctrl.updateStatus);
router.patch('/:id/phase',  auth, role(['admin', 'staff']), ctrl.updatePhase);
router.put('/:id/phase',    auth, role(['admin', 'staff']), ctrl.updatePhase);
router.put('/:id/worked-by', auth, role(['admin', 'staff']), ctrl.setWorkedBy);
router.put('/:id/price',    auth, role(['admin', 'staff']), ctrl.setPrice);
router.get('/:id/phase',    auth, ctrl.getPhase); // signed in; a customer sees only their own wash

module.exports = router;
