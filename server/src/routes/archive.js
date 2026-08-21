const router = require('express').Router();
const auth = require('../middleware/auth');
const superAdmin = require('../middleware/superAdmin');
const ctrl = require('../controllers/archiveController');

router.get('/', auth, superAdmin, ctrl.listArchived);

module.exports = router;
