const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/rolesController');

// Roles management (Super Admin and Franchise Admin for own custom roles)
router.get('/', auth, role(['admin', 'super_admin']), ctrl.listRoles);
router.post('/', auth, role(['admin', 'super_admin']), ctrl.createRole);
router.put('/:id', auth, role(['admin', 'super_admin']), ctrl.updateRole);
router.delete('/:id', auth, role(['admin', 'super_admin']), ctrl.deleteRole);

// Permissions checklist (strictly filtered and validated against franchise entitlement ceiling)
router.get('/permissions', auth, role(['admin', 'super_admin']), ctrl.listAllPermissions);
router.get('/:id/permissions', auth, role(['admin', 'super_admin']), ctrl.getRolePermissions);
router.post('/:id/permissions', auth, role(['admin', 'super_admin']), ctrl.saveRolePermissions);

module.exports = router;
