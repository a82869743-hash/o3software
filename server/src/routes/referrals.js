const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referralController');
const protect = require('../middleware/auth');

router.use(protect);

router.get('/:customer_id/code', referralController.getReferralCode);
router.get('/:customer_id/history', referralController.getHistory);
router.post('/apply', referralController.applyReferral);

module.exports = router;
