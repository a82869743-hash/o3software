const express = require('express');
const router = express.Router();
const messagesController = require('../controllers/messagesController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.use(authorize('admin')); // Only admin can view logs and send messages

router.get('/log', messagesController.listLogs);
router.get('/bulk/preview', messagesController.getBulkPreview);
router.post('/bulk', messagesController.sendBulk);
router.post('/send', messagesController.sendSingle);

module.exports = router;
