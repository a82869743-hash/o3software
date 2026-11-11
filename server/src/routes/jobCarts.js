const router = require('express').Router();
const multer = require('multer');
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/jobCartController');
const belongingsCtrl = require('../controllers/belongingsController');

// photos only (car photos, belongings): anything else is refused with a clear message
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = file.originalname || '';
    const okExt = !/\.[a-z0-9]+$/i.test(name) || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(name); // camera blobs may have no extension
    if (IMAGE_TYPES.includes(file.mimetype) && okExt) return cb(null, true);
    req.badFileType = true;
    cb(null, false);
  },
});
const imagesOnly = (req, res, next) => (req.badFileType ? res.status(400).json({ success: false, error: 'Only photos can be uploaded (JPG, PNG, WEBP, HEIC)' }) : next());

router.get('/discount-approvers', auth, role(['admin', 'staff']), ctrl.discountApprovers);

// Vehicle lookup
router.get('/vehicles/lookup/:regNo', auth, role(['admin', 'staff']), ctrl.lookup);

// Job cart CRUD
router.get('/',         auth, role(['admin', 'customer', 'staff']), ctrl.list);
router.post('/',        auth, role(['admin', 'staff']), ctrl.create);
router.get('/:id',      auth, role(['admin', 'customer', 'staff']), ctrl.getOne);
router.put('/:id',          auth, role(['admin', 'staff']), ctrl.update);
router.put('/:id/billing',  auth, role(['admin', 'staff']), ctrl.update);

// Status transitions
router.patch('/:id/submit',   auth, role(['admin', 'staff']), ctrl.submit);
router.patch('/:id/complete', auth, role(['admin']), ctrl.complete);

// Services
router.post('/:id/services',       auth, role(['admin', 'staff']), ctrl.addService);
router.put('/:id/services/:sid',   auth, role(['admin', 'staff']), ctrl.updateService);
router.delete('/:id/services/:sid', auth, role(['admin', 'staff']), ctrl.deleteService);

// Photos
router.get('/:id/photos',         auth, role(['admin', 'staff', 'customer']), ctrl.listPhotos);
router.post('/:id/photos',        auth, role(['admin', 'staff']), upload.array('photos', 10), imagesOnly, ctrl.uploadPhoto);
router.delete('/:id/photos/:pid', auth, role(['admin', 'staff']), ctrl.deletePhoto);
router.get('/:id/photos/download', auth, role(['admin', 'staff', 'customer']), ctrl.downloadAllPhotos);


// Job Card Live Pipeline Stages (Customer Timeline & Admin Pipeline)
router.get('/:id/stages', auth.optionalAuth || auth, ctrl.getStages);
router.put('/:id/stages', auth, role(['admin', 'staff']), ctrl.updateStage);

// Job Card PDF & Invoice PDF

router.get('/:id/pdf', auth, role(['admin', 'staff', 'customer']), ctrl.getJobCardPDF);
router.get('/:id/invoice', auth, role(['admin', 'staff', 'customer']), ctrl.getInvoice);



// Soft delete / restore
router.delete('/:id',          auth, role(['admin']), ctrl.softDelete);
router.post('/:id/restore',   auth, role(['admin']), ctrl.restore);

// Customer Belongings
router.get('/:id/belongings',        auth, role(['admin', 'staff']), belongingsCtrl.list);
router.post('/:id/belongings',       auth, role(['admin', 'staff']), upload.single('image'), imagesOnly, belongingsCtrl.create);
router.delete('/:id/belongings/:bid', auth, role(['admin', 'staff']), belongingsCtrl.remove);

module.exports = router;
