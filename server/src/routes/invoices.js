const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/invoicesController');

router.get('/', auth, role(['admin']), ctrl.listAll);
router.get('/export-pdf', auth, ctrl.exportPdf);

module.exports = router;
