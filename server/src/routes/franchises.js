const router = require('express').Router();
require('../middleware/numericIds')(router, ['id', 'userId']);
const auth = require('../middleware/auth');
const superAdmin = require('../middleware/superAdmin');
const role = require('../middleware/role');
const ctrl = require('../controllers/franchiseController');

// List franchises (Super Admin sees all, others see active only)
router.get('/', auth, ctrl.list);

// Studios a new customer can choose at sign-up (no login)
router.get('/public', ctrl.publicList);

// Consolidated cross-franchise view (Super Admin only)
router.get('/consolidated/overview', auth, superAdmin, ctrl.consolidatedOverview);

// User management from platform console (Super Admin only)
router.post('/users/:userId/force-logout', auth, superAdmin, ctrl.forceLogoutUser);
router.post('/users/:userId/reset-password', auth, superAdmin, ctrl.resetUserPassword);
router.patch('/users/:userId/status', auth, superAdmin, ctrl.toggleUserStatus);

// Get single franchise details and live stats
router.get('/:id', auth, ctrl.getOne);

// Create franchise (Super Admin only)
router.post('/', auth, superAdmin, ctrl.create);

// Update franchise details/branding (Super Admin or branch admin for own)
router.put('/:id', auth, role(['admin']), ctrl.update);

// Toggle/disable franchise status (Super Admin only)
router.patch('/:id/status', auth, superAdmin, ctrl.toggleStatus);

// Soft-delete franchise (Super Admin only)
router.delete('/:id', auth, superAdmin, ctrl.softDelete);

// Feature Entitlements (Super Admin only)
router.get('/:id/entitlements', auth, superAdmin, ctrl.getEntitlements);
router.put('/:id/entitlements', auth, superAdmin, ctrl.updateEntitlements);
router.post('/:id/entitlements/preset', auth, superAdmin, ctrl.applyPreset);

router.get('/:id/users', auth, superAdmin, ctrl.listUsers);

// Franchise Owner Account Creation (Super Admin only)
router.post('/:id/owner', auth, superAdmin, ctrl.createOwnerAccount);

// Impersonate Franchise ("View as franchise") (Super Admin only)
router.post('/:id/impersonate', auth, superAdmin, ctrl.impersonate);

// Per-franchise settings (services, pricing, slots, branding)
router.get('/:id/settings', auth, ctrl.getSettings);
router.put('/:id/settings', auth, superAdmin, ctrl.updateSettings);

module.exports = router;
