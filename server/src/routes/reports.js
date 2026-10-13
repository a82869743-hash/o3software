const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/reportsController');
const incentiveCtrl = require('../controllers/incentiveController');

// All reports are admin / manager accessible
router.get('/sales',            auth, role(['admin']), ctrl.salesReport);
router.get('/inventory',        auth, role(['admin']), ctrl.inventoryReport);
router.get('/job-cards',        auth, role(['admin']), ctrl.jobCardReport);
router.get('/welcome-rewards',  auth, role(['admin']), ctrl.welcomeRewardsReport);
router.get('/package-history',  auth, role(['admin']), ctrl.packageHistoryReport);
router.get('/incentives',       auth, role(['admin', 'manager']), incentiveCtrl.getIncentiveReport);

module.exports = router;
