const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/buySellController');

router.get('/',              auth, role(['admin']), ctrl.list);
router.post('/',             auth, role(['admin']), ctrl.create);
router.patch('/:id/complete', auth, role(['admin']), ctrl.complete);
router.get('/:id/invoice',    auth, role(['admin']), ctrl.invoice);

module.exports = router;
