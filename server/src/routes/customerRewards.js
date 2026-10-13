const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/customerRewardsController');

router.get('/',               auth, ctrl.list);
router.get('/my-rewards',     auth, ctrl.list);
router.post('/award-welcome', auth, role(['admin']), ctrl.awardWelcome);
router.post('/:id/redeem',    auth, role(['admin', 'customer']), ctrl.redeem);

module.exports = router;
