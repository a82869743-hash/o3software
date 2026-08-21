const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/servicesController');

router.get('/',             ctrl.list);  // public
router.get('/:id',          ctrl.getOne);
router.post('/',            auth, role(['admin']), ctrl.create);
router.put('/:id',          auth, role(['admin']), ctrl.update);
router.patch('/:id/toggle', auth, role(['admin']), ctrl.toggleActive);
router.delete('/:id',       auth, role(['admin']), ctrl.delete);

// ─── Service Categories ────────────────────────────
router.get('/categories/list',     ctrl.listCategories);  // public
router.post('/categories',        auth, role(['admin']), ctrl.createCategory);
router.put('/categories/:id',     auth, role(['admin']), ctrl.updateCategory);
router.delete('/categories/:id',  auth, role(['admin']), ctrl.deleteCategory);

// ─── Service Add-ons ───────────────────────────────
router.get('/:serviceId/addons',           ctrl.listAddons);   // public
router.post('/:serviceId/addons',          auth, role(['admin']), ctrl.createAddon);
router.put('/:serviceId/addons/:addonId',  auth, role(['admin']), ctrl.updateAddon);
router.delete('/:serviceId/addons/:addonId', auth, role(['admin']), ctrl.deleteAddon);

module.exports = router;
