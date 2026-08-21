const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/franchiseController');

router.get('/', auth, ctrl.list);
router.post('/', auth, role(['admin']), ctrl.create);

module.exports = router;
