const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/incentiveController');

// Rules management (Admin only)
router.get('/rules', auth, role(['admin']), ctrl.getRules);
router.post('/rules', auth, role(['admin']), ctrl.createRule);
router.put('/rules/:id', auth, role(['admin']), ctrl.updateRule);

// Incentive report (Admin and Manager)
router.get('/report', auth, role(['admin', 'manager']), ctrl.getIncentiveReport);
router.patch('/splits/:id/status', auth, role(['admin']), ctrl.updateSplitStatus);

// Slab incentives: complaints and the rate card
router.get('/complaints', auth, role(['admin', 'manager']), ctrl.listComplaints);
router.post('/complaints', auth, role(['admin', 'manager']), ctrl.logComplaint);
router.get('/slabs', auth, role(['admin', 'manager', 'staff']), ctrl.getSlabs);
router.put('/slabs', auth, role(['admin']), ctrl.updateSlabs);

module.exports = router;
