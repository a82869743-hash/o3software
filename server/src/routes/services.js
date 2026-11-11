const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/servicesController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Pictures for services / packages (uploaded photos and AI pictures share uploads/illustrations)
const picDir = path.join(__dirname, '..', '..', 'uploads', 'illustrations');
fs.mkdirSync(picDir, { recursive: true });
const picUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, picDir),
    filename: (req, file, cb) => cb(null, `photo_${Date.now()}_${require('crypto').randomBytes(4).toString('hex')}${(path.extname(file.originalname) || '.jpg').toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (/^image\/(png|jpe?g|webp)$/.test(file.mimetype) ? cb(null, true) : cb(new Error('Only JPG, PNG or WebP pictures'))),
});

router.post('/generate-image', auth, role(['admin']), ctrl.generateImage);
router.post('/upload-image',   auth, role(['admin']), picUpload.single('image'), ctrl.uploadImage);
router.put('/reorder/:kind', auth, role(['admin']), ctrl.reorder); // kind: services | categories
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
