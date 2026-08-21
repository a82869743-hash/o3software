const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/quotationController');

router.get('/',            auth, role(['admin']), ctrl.list);
router.post('/',           auth, role(['admin']), ctrl.create);
router.get('/:id',         auth, role(['admin']), ctrl.getOne);
router.put('/:id',         auth, role(['admin']), ctrl.update);
router.delete('/:id',      auth, role(['admin']), ctrl.softDelete);
router.get('/:id/pdf',     auth, role(['admin']), ctrl.downloadPDF);

module.exports = router;
