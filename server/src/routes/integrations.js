const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const superAdmin = require('../middleware/superAdmin');
const ctrl = require('../controllers/integrationsController');

// Super Admin only — integration health + one-off test sends
router.get('/status', protect, superAdmin, ctrl.status);
router.post('/test', protect, superAdmin, ctrl.test);

module.exports = router;
