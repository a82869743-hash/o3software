const router = require('express').Router();
const protect = require('../middleware/auth');
const role = require('../middleware/role');
const superAdmin = require('../middleware/superAdmin');
const ctrl = require('../controllers/stockRequestController');

router.get('/', protect, role(['admin', 'staff', 'franchise']), ctrl.list);
router.post('/', protect, role(['admin', 'staff', 'franchise']), ctrl.create);
router.post('/:id/approve', protect, role(['admin', 'super_admin']), ctrl.approve);
router.put('/:id/approve',  protect, role(['admin', 'super_admin']), ctrl.approve);
router.post('/:id/reject',  protect, role(['admin', 'super_admin']), ctrl.reject);
router.put('/:id/reject',   protect, role(['admin', 'super_admin']), ctrl.reject);

module.exports = router;
