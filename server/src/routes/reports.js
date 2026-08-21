const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/reportsController');

// All reports are admin-only
router.get('/sales',     auth, role(['admin']), ctrl.salesReport);
router.get('/inventory', auth, role(['admin']), ctrl.inventoryReport);
router.get('/job-cards', auth, role(['admin']), ctrl.jobCardReport);
router.get('/welcome-rewards', auth, role(['admin']), ctrl.welcomeRewardsReport);
router.get('/package-history', auth, role(['admin']), ctrl.packageHistoryReport);

module.exports = router;
