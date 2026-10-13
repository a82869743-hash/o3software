const router = require('express').Router();
const protect = require('../middleware/auth');
const role = require('../middleware/role');
const superAdmin = require('../middleware/superAdmin');
const ctrl = require('../controllers/stockRequestController');

router.get('/', protect, ctrl.list);
router.post('/', protect, role(['admin', 'staff', 'franchise']), ctrl.create);
router.post('/:id/approve', protect, superAdmin, ctrl.approve);
router.put('/:id/approve',  protect, superAdmin, ctrl.approve);
router.post('/:id/reject',  protect, superAdmin, ctrl.reject);
router.put('/:id/reject',   protect, superAdmin, ctrl.reject);

module.exports = router;
