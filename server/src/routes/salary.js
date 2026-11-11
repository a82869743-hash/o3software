const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/salaryController');

// Employee self-service
router.get('/my', auth, role(['staff']), ctrl.mySalary);
router.get('/my/:id/slip', auth, role(['staff']), ctrl.downloadSlip);

// Admin / permitted managers
router.get('/', auth, role(['admin']), ctrl.getSalary);
router.post('/calculate', auth, role(['admin']), ctrl.calculateSalary);
router.post('/', auth, role(['admin']), ctrl.createSalary);
router.get('/:id/slip', auth, role(['admin']), ctrl.downloadSlip);
router.put('/:id', auth, role(['admin']), ctrl.updateSalary);
router.post('/:id/pay', auth, role(['admin']), ctrl.paySalary);

module.exports = router;
