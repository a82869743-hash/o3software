const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/customersController');

router.get('/', auth, role(['admin']), ctrl.list);
router.get('/lookup/:mobile', auth, role(['admin']), ctrl.lookupByMobile);
router.post('/manual-registration', auth, role(['admin']), ctrl.createManual);
router.get('/manual-registration/list', auth, role(['admin']), ctrl.listManual);
router.get('/:id', auth, role(['admin']), ctrl.getDetail);
router.get('/:id/package-history/export', auth, role(['admin']), require('../controllers/reportsController').customerPackageHistoryReport);
router.post('/:id/notes', auth, role(['admin']), ctrl.addNote);
router.delete('/:id', auth, role(['admin']), ctrl.softDelete);
router.post('/:id/restore', auth, role(['admin']), ctrl.restore);

module.exports = router;
