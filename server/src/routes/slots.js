const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/slotsController');

router.get('/',      ctrl.list);  // public
router.post('/',     auth, role(['admin']), ctrl.create);
router.post('/bulk', auth, role(['admin']), ctrl.bulkCreate);
router.patch('/:id', auth, role(['admin']), ctrl.update);
router.delete('/:id', auth, role(['admin']), ctrl.delete);

module.exports = router;
