const router = require('express').Router();
const auth = require('../middleware/auth');
const superAdmin = require('../middleware/superAdmin');
const ctrl = require('../controllers/rolesController');

router.get('/', auth, superAdmin, ctrl.listRoles);
router.post('/', auth, superAdmin, ctrl.createRole);
router.put('/:id', auth, superAdmin, ctrl.updateRole);
router.delete('/:id', auth, superAdmin, ctrl.deleteRole);

router.get('/permissions', auth, superAdmin, ctrl.listAllPermissions);
router.get('/:id/permissions', auth, superAdmin, ctrl.getRolePermissions);
router.post('/:id/permissions', auth, superAdmin, ctrl.saveRolePermissions);

module.exports = router;
