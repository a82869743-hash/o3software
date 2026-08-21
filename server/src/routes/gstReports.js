const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/gstController');

router.get('/', auth, role(['admin']), ctrl.getReport);

module.exports = router;
