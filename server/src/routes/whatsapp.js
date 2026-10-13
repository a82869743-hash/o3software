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

// ── Provider Governance & Settings ─────────────────────────────────────────
router.get('/provider-config',       auth, role(['admin']), ctrl.getProviderConfig);
router.post('/provider-config',      auth, role(['admin']), ctrl.updateProviderConfig);
router.post('/baileys/wipe',         auth, role(['admin']), ctrl.baileysWipe);
router.get('/usage',                 auth, role(['admin']), ctrl.getUsageStats);
router.get('/opt-outs',              auth, role(['admin']), ctrl.getOptOuts);
router.post('/opt-outs/remove',      auth, role(['admin']), ctrl.removeOptOut);
router.get('/templates',             auth, role(['admin']), ctrl.listTemplates);
router.post('/templates',            auth, role(['admin']), ctrl.createTemplate);

// ── Baileys Session Management (Demo Mode) ──────────────────────────────────
router.get('/baileys/status',        auth, role(['admin']), ctrl.baileysStatus);
router.post('/baileys/connect',      auth, role(['admin']), ctrl.baileysConnect);
router.post('/baileys/disconnect',   auth, role(['admin']), ctrl.baileysDisconnect);
router.post('/baileys/pairing-code', auth, role(['admin']), ctrl.baileysRequestPairingCode);
router.post('/baileys/send-test',    auth, role(['admin']), ctrl.baileysSendTest);

// ── Inbound Webhook (Meta Cloud API & BSPs) ─────────────────────────────────
router.get('/webhook',               ctrl.webhook);
router.post('/webhook',              ctrl.webhook);

module.exports = router;


