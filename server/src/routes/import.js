const express = require('express');
const router = express.Router();
const multer = require('multer');
const importController = require('../controllers/importController');
const { protect, authorize } = require('../middleware/auth');

// Since we're parsing directly from buffer, we use memoryStorage
const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);
router.use(authorize('admin')); // Only admins can run template imports

router.get('/template', importController.downloadTemplate);
router.post('/customers', upload.single('file'), importController.importCustomers);
router.post('/inventory', upload.single('file'), importController.importInventory);

module.exports = router;
