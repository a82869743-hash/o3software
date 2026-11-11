const express = require('express');
const router = express.Router();
const multer = require('multer');
const importController = require('../controllers/importController');
const { protect, authorize } = require('../middleware/auth');

// Since we're parsing directly from buffer, we use memoryStorage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (/\.(xlsx|xls|csv)$/i.test(file.originalname) ? cb(null, true) : cb(new Error('Only .xlsx, .xls or .csv files are allowed'))),
});

router.use(protect);
router.use(authorize('admin')); // admins + users granted import.create

router.get('/template', importController.downloadTemplate);
router.post('/customers', upload.single('file'), importController.importCustomers);
router.post('/inventory', upload.single('file'), importController.importInventory);
// Catalog & prices are HQ-controlled: Super Admin, or a franchise the Super Admin allowed to edit services
router.post('/services', (req, res, next) => (req.user.role === 'super_admin' || (req.userPermissions || []).includes('services.create') ? next() : res.status(403).json({ success: false, error: 'Only the Super Admin can import services & prices' })), upload.single('file'), importController.importServices);

module.exports = router;
