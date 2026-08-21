const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const optionalAuth = require('../middleware/optionalAuth');
const ctrl = require('../controllers/packagesController');
const userPkgCtrl = require('../controllers/userPackagesController');

// ─── Public/Role-filtered routes ────────────────────────────
// optionalAuth: If JWT present → req.user is set (admin sees all).
// If no JWT or invalid → req.user = null (customer-filtered view).
router.get('/',              optionalAuth, ctrl.list);

// ─── Package Purchase Requests ────────────────────────────────
router.post('/requests',            auth, role(['customer']), ctrl.createRequest);
router.get('/requests/my',          auth, role(['customer']), ctrl.getMyRequests);
router.get('/requests',             auth, role(['admin']), ctrl.listRequests);
router.put('/requests/:id/approve', auth, role(['admin']), ctrl.approveRequest);
router.put('/requests/:id/reject',  auth, role(['admin']), ctrl.rejectRequest);
router.get('/requests/:id/invoice', optionalAuth, ctrl.downloadInvoice);

// ─── Package Services (for filtered booking flow) ────────────
router.get('/:id/services',  auth, ctrl.getPackageServices);

router.get('/:id',           ctrl.getOne);

// ─── Admin-only CRUD ────────────────────────────────────────
router.post('/',             auth, role(['admin']), ctrl.create);
router.put('/:id',           auth, role(['admin']), ctrl.update);
router.patch('/:id/toggle',  auth, role(['admin']), ctrl.togglePublish);
router.patch('/:id/visibility', auth, role(['admin']), ctrl.toggleVisibility);
router.delete('/:id',        auth, role(['admin']), ctrl.delete);

// ─── TASK 4: Package Assignment (POST /packages/assign) ─────
// Admin assigns a package to a customer
router.post('/assign', auth, role(['admin']), userPkgCtrl.assignPackage);

// Admin creates and assigns a custom package
router.post('/custom-assign', auth, role(['admin']), ctrl.customAssign);

module.exports = router;
