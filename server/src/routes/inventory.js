const router = require('express').Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/inventoryController');

router.post('/bulk-upload', auth, role(['admin']), upload.single('file'), ctrl.bulkUpload);
router.post('/upload-image', auth, role(['admin']), upload.any(), ctrl.uploadImage);
router.post('/bulk-delete', auth, role(['admin']), ctrl.bulkDelete);
router.post('/bulk-update-category', auth, role(['admin']), ctrl.bulkUpdateCategory);
router.post('/bulk-update-status', auth, role(['admin']), ctrl.bulkUpdateStatus);
router.get('/categories', auth, role(['admin', 'staff', 'franchise', 'customer']), ctrl.getCategories);
router.post('/categories', auth, role(['admin']), ctrl.createCategory);
router.put('/categories', auth, role(['admin']), ctrl.renameCategory);
router.delete('/categories', auth, role(['admin']), ctrl.deleteCategory);

router.get('/:id/franchise-pricing', auth, role(['admin']), ctrl.getFranchisePricings);
router.post('/:id/franchise-pricing', auth, role(['admin']), ctrl.setFranchisePricing);

router.get('/',          auth, role(['admin', 'staff', 'franchise', 'customer']), ctrl.list);
router.get('/:id',       auth, role(['admin', 'staff', 'franchise', 'customer']), ctrl.getOne);
router.post('/',         auth, role(['admin']), ctrl.create);
router.put('/:id',       auth, role(['admin']), ctrl.update);
router.patch('/:id/quantity', auth, role(['admin']), ctrl.adjustQuantity);
router.delete('/:id',    auth, role(['admin']), ctrl.softDelete);

module.exports = router;
