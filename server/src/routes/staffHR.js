const router = require('express').Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const ctrl = require('../controllers/staffHRController');

// Tasks
router.get('/tasks', auth, role(['admin', 'staff']), ctrl.getStaffTasks);
router.post('/tasks', auth, role(['admin']), ctrl.createStaffTask);
router.put('/tasks/:id/status', auth, role(['admin', 'staff']), ctrl.updateTaskStatus);

// Leaves
router.get('/leaves', auth, role(['admin', 'staff']), ctrl.getStaffLeaves);
router.post('/leaves', auth, role(['admin', 'staff']), ctrl.requestLeave);
router.put('/leaves/:id/status', auth, role(['admin']), ctrl.updateLeaveStatus);

// Attendance
router.get('/attendance', auth, role(['admin', 'staff']), ctrl.getStaffAttendanceList);

// Payroll
router.get('/payroll', auth, role(['admin', 'staff']), ctrl.getPayrollList);
router.post('/payroll/process', auth, role(['admin']), ctrl.processPayroll);
router.put('/payroll/:id', auth, role(['admin']), ctrl.updatePayrollItem);

module.exports = router;
