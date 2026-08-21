const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/customerRewardsController');

router.get('/',               auth, ctrl.list);
router.post('/award-welcome', auth, role(['admin']), ctrl.awardWelcome);
router.post('/:id/redeem',    auth, role(['admin']), ctrl.redeem);

module.exports = router;
