const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/referralController');

// Public: check a referral code on the registration form
router.get('/validate/:code', ctrl.validateCode);

// Self-service (customer or employee): own code + earnings
router.get('/my', auth, role(['customer', 'staff']), ctrl.mine);
// Refer a friend: their name, number and car → a lead for the studio; reward after their first service
router.post('/invite', auth, role(['customer', 'staff']), ctrl.invite);

// Referrals module (permission: referrals.*)
router.get('/summary', auth, role(['admin']), ctrl.summary);
router.get('/settings', auth, role(['admin']), ctrl.getSettings);
router.put('/settings', auth, role(['admin']), ctrl.updateSettings);
router.post('/pay', auth, role(['admin']), ctrl.markPaid);
router.post('/:id/unpay', auth, role(['admin']), ctrl.markUnpaid);
router.post('/', auth, role(['admin']), ctrl.createManual);
router.get('/', auth, role(['admin']), ctrl.list);

module.exports = router;
