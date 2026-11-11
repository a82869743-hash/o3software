const express = require('express');
const router = express.Router();
const deliveriesController = require('../controllers/deliveriesController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', deliveriesController.list);
router.get('/active', authorize('staff'), deliveriesController.getActiveDelivery);
router.get('/assigned', deliveriesController.getAssigned);
router.get('/my', authorize('customer'), deliveriesController.getMyDelivery);
router.get('/:id', deliveriesController.getOne);

// Staff specific routes
router.post('/', authorize('admin', 'staff'), deliveriesController.startDelivery);
router.patch('/:id/start', authorize('admin', 'staff'), deliveriesController.beginDelivery);
router.patch('/:id/assign', authorize('admin'), deliveriesController.assignDriver);
router.patch('/:id/status', authorize('admin'), deliveriesController.setStatus);
router.patch('/:id/complete', authorize('admin', 'staff'), deliveriesController.completeDelivery);
router.patch('/:id/location', authorize('admin', 'staff'), deliveriesController.updateLocation);
router.get('/:id/location', deliveriesController.getLocation);

module.exports = router;
