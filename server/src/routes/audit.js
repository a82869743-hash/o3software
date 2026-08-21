const router = require('express').Router();
const auth = require('../middleware/auth');
const superAdmin = require('../middleware/superAdmin');
const ctrl = require('../controllers/auditController');

router.get('/', auth, superAdmin, ctrl.getAuditLogs);
router.get('/summary', auth, superAdmin, ctrl.getAuditSummary);

module.exports = router;
