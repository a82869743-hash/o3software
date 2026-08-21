const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/billingController');

router.get('/',              auth, role(['admin']), ctrl.list);
router.get('/:id/invoice',   auth, role(['admin']), ctrl.downloadInvoice);
router.get('/:id',           auth, role(['admin']), ctrl.getOne);
router.post('/',             auth, role(['admin']), ctrl.create);
router.delete('/:id',        auth, role(['admin']), ctrl.softDelete);
router.post('/:id/restore',  auth, role(['admin']), ctrl.restore);

module.exports = router;
