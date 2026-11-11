const express = require('express');
const router = express.Router();
const inquiriesController = require('../controllers/inquiriesController');
const { protect, authorize, optionalAuth } = require('../middleware/auth');

// Public route: website contact form
router.post('/', optionalAuth, inquiriesController.create);

// Protected routes (Admin & Staff)
router.use(protect);
router.use(authorize('admin', 'staff'));

router.get('/stats', inquiriesController.stats);
router.get('/', inquiriesController.list);
router.get('/:id', inquiriesController.getOne);
router.patch('/:id/status', inquiriesController.updateStatus);
router.post('/:id/reply', inquiriesController.reply);
router.post('/:id/convert', inquiriesController.convert);
router.delete('/:id', authorize('admin'), inquiriesController.delete);

module.exports = router;
