const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/pickupController');

// All endpoints require authentication
router.get('/addresses',     auth, role(['customer', 'admin']), ctrl.getAddresses);
router.post('/addresses',    auth, role(['customer', 'admin']), ctrl.createAddress);
router.get('/last-address',  auth, role(['customer', 'admin']), ctrl.getLastAddress);
router.post('/',             auth, role(['customer', 'admin']), ctrl.create);
router.get('/',              auth, role(['admin', 'customer', 'staff']), ctrl.list);
router.get('/:id',           auth, role(['admin', 'customer', 'staff']), ctrl.getOne);
router.patch('/:id/assign',  auth, role(['admin']), ctrl.assign);
router.patch('/:id/picked-up', auth, role(['admin', 'staff']), ctrl.markPickedUp);

module.exports = router;
