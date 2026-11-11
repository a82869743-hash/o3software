const router = require('express').Router();
require('../middleware/numericIds')(router, ['id']);
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/feedbackController');

// Public Feedback Form Lookups & Submissions (NO AUTH CHECK REQUIRED)
router.get('/form/:token', ctrl.getFormContext);
router.post('/', ctrl.submitFeedback);

// Customer: services awaiting a rating + own feedback
router.get('/mine', auth, role(['customer']), ctrl.mine);

// Admin Feedback & Review Management (AUTH REQUIRED)
router.get('/', auth, role(['admin']), ctrl.getFeedback);
router.get('/stats', auth, role(['admin']), ctrl.getFeedbackStats);
// reviews are tracked only — admins don't reply
router.patch('/:id/publish', auth, role(['admin']), ctrl.publishFeedback);
router.post('/request', auth, role(['admin']), ctrl.requestFeedbackManual);

// Referral Codes & Programs (Authentication Required)
router.get('/referral', auth, ctrl.getReferralStats);

module.exports = router;
