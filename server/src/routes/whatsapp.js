const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/whatsappController');

// ── Existing routes ────────────────────────────────────────────────────────
router.get('/',              auth, role(['admin']), ctrl.list);
router.get('/stats',         auth, role(['admin']), ctrl.stats);
router.post('/send',         auth, role(['admin']), ctrl.sendManual);
router.post('/send-manual',        auth, role(['admin']), ctrl.sendManual);
router.post('/send-invoice',       auth, role(['admin']), ctrl.sendInvoice);
router.post('/preview-humanized',  auth, role(['admin']), ctrl.previewHumanized);

// ── Baileys session management ────────────────────────────────────────────
router.get('/baileys/status',        auth, role(['admin']), ctrl.baileysStatus);
router.post('/baileys/connect',      auth, role(['admin']), ctrl.baileysConnect);
router.post('/baileys/disconnect',   auth, role(['admin']), ctrl.baileysDisconnect);
router.post('/baileys/pairing-code', auth, role(['admin']), ctrl.baileysRequestPairingCode);
router.post('/baileys/send-test',    auth, role(['admin']), ctrl.baileysSendTest);

module.exports = router;

