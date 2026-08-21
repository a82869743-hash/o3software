const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/balanceSheetController');

router.get('/', auth, role(['admin']), ctrl.getBalanceSheet);
router.get('/export', auth, role(['admin']), ctrl.exportBalanceSheet);
router.get('/expenses', auth, role(['admin']), ctrl.getExpenses);
router.get('/expense-categories', auth, role(['admin']), ctrl.getExpenseCategories);
router.post('/expenses', auth, role(['admin']), ctrl.createExpense);

module.exports = router;
