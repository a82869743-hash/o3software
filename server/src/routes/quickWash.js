const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/quickWashController');

// Quick wash routes (admin/staff only)
router.get('/',             auth, role(['admin', 'staff']), ctrl.list);
router.get('/stats',        auth, role(['admin', 'staff']), ctrl.queueStats);
router.post('/',            auth, role(['admin', 'staff']), ctrl.create);
router.get('/:id/invoice',  auth, role(['admin', 'staff']), ctrl.getInvoice);
router.patch('/:id/status', auth, role(['admin', 'staff']), ctrl.updateStatus);
router.patch('/:id/phase', auth, role(['admin', 'staff']), ctrl.updatePhase);
router.get('/:id/phase', ctrl.getPhase);

module.exports = router;
