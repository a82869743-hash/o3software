const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/fileSharingController');
const multer = require('multer');
const path = require('path');

// Multer setup for shared files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../../public/uploads/shared'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'shared-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

router.get('/', auth, ctrl.list);
router.post('/upload', auth, role(['admin', 'staff']), upload.single('file'), ctrl.upload);
router.post('/generate-link', auth, role(['admin', 'staff']), ctrl.generateLink);
router.delete('/:id', auth, role(['admin', 'staff']), ctrl.delete);
router.get('/download/:token', ctrl.downloadByToken);

module.exports = router;
