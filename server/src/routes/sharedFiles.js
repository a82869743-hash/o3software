const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/fileSharingController');
const multer = require('multer');
const path = require('path');

const fs = require('fs');

// Ensure shared upload directory exists
const SHARED_UPLOAD_DIR = path.join(__dirname, '../../public/uploads/shared');
if (!fs.existsSync(SHARED_UPLOAD_DIR)) {
  fs.mkdirSync(SHARED_UPLOAD_DIR, { recursive: true });
}

// Multer setup for shared files with strict whitelist
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, SHARED_UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    cb(null, 'shared-' + uniqueSuffix + ext);
  }
});

const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.txt', '.csv', '.xls', '.xlsx', '.doc', '.docx'];
const ALLOWED_MIMES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain', 'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTS.includes(ext) && ALLOWED_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only standard documents and images are permitted.'));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

router.get('/', auth, ctrl.list);
router.post('/upload', auth, role(['admin', 'staff']), upload.single('file'), ctrl.upload);
router.post('/generate-link', auth, role(['admin', 'staff']), ctrl.generateLink);
router.delete('/:id', auth, role(['admin', 'staff']), ctrl.delete);
router.get('/download/:token', ctrl.downloadByToken);

module.exports = router;
