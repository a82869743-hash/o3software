const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/whatsappController');

router.get('/',           auth, role(['admin']), ctrl.list);
router.get('/stats',      auth, role(['admin']), ctrl.stats);
router.post('/send',      auth, role(['admin']), ctrl.sendManual);
router.post('/send-manual', auth, role(['admin']), ctrl.sendManual);
router.post('/send-invoice', auth, role(['admin']), ctrl.sendInvoice);

module.exports = router;
