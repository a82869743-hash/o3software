const express = require('express');
const router = express.Router();
const deliveriesController = require('../controllers/deliveriesController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', deliveriesController.list);
router.get('/active', authorize('staff'), deliveriesController.getActiveDelivery);
router.get('/my', authorize('customer'), deliveriesController.getMyDelivery);
router.get('/:id', deliveriesController.getOne);

// Staff specific routes
router.post('/', authorize('admin', 'staff'), deliveriesController.startDelivery);
router.patch('/:id/complete', authorize('admin', 'staff'), deliveriesController.completeDelivery);
router.patch('/:id/location', authorize('admin', 'staff'), deliveriesController.updateLocation);
router.get('/:id/location', deliveriesController.getLocation);

module.exports = router;
