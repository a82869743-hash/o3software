const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/searchController');

// All search routes require authentication
router.get('/customers',  auth, role(['admin', 'staff']), ctrl.customers);
router.get('/vehicles',   auth, role(['admin', 'staff']), ctrl.vehicles);
router.get('/inventory',  auth, role(['admin', 'staff']), ctrl.inventory);
router.get('/vendors',    auth, role(['admin']), ctrl.vendors);
router.get('/global',     auth, role(['admin', 'staff']), ctrl.global);

module.exports = router;
