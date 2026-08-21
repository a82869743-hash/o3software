const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const auth = require('../middleware/auth');
const role = require('../middleware/role');

router.use(auth);

router.get('/:customer_id', walletController.getWallet);
router.get('/:customer_id/transactions', walletController.getTransactions);
router.post('/:customer_id/adjust', role(['admin']), walletController.adjustBalance);

module.exports = router;
