const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/feedbackController');

// Public Feedback Form Lookups & Submissions (NO AUTH CHECK REQUIRED)
router.get('/form/:token', ctrl.getFormContext);
router.post('/', ctrl.submitFeedback);

// Admin Feedback & Review Management (AUTH REQUIRED)
router.get('/', auth, role(['admin']), ctrl.getFeedback);
router.get('/stats', auth, role(['admin']), ctrl.getFeedbackStats);
router.patch('/:id/reply', auth, role(['admin']), ctrl.replyToFeedback);
router.patch('/:id/publish', auth, role(['admin']), ctrl.publishFeedback);
router.post('/request', auth, role(['admin']), ctrl.requestFeedbackManual);

// Referral Codes & Programs (Authentication Required)
router.get('/referral', auth, ctrl.getReferralStats);
router.post('/referral/generate', auth, ctrl.generateReferralCode);
router.post('/referral/apply', auth, ctrl.applyReferralCode);

module.exports = router;
