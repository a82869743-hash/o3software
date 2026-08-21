const express = require('express');
const router = express.Router();
const vehiclesController = require('../controllers/vehiclesController');
const auth = require('../middleware/auth');
const role = require('../middleware/role');

// Existing routes (untouched)
router.get('/my-vehicles', auth, vehiclesController.getVehicles);
router.get('/brands', vehiclesController.getBrands);
router.get('/models', vehiclesController.getModels);
router.get('/variants', vehiclesController.getVariants);

// ─── Admin Vehicle Routes ───────────────────────────────────
router.get('/all',                    auth, role(['admin']), vehiclesController.getAllVehicles);
router.get('/by-customer/:customerId', auth, role(['admin']), vehiclesController.getByCustomer);

// ─── Vehicle Master Admin Routes ───────────────────────────
router.get('/master',       auth, role(['admin']), vehiclesController.getAllMaster);
router.post('/master',      auth, role(['admin']), vehiclesController.createMaster);
router.put('/master/:id',   auth, role(['admin']), vehiclesController.updateMaster);
router.delete('/master/:id', auth, role(['admin']), vehiclesController.deleteMaster);

// ─── Car Management Routes ──────────────────────────────────
router.post('/add',          auth, vehiclesController.addCar);
router.patch('/:id/primary', auth, vehiclesController.setPrimary);
router.patch('/:id',         auth, vehiclesController.updateCar);
router.delete('/:id',        auth, vehiclesController.deleteCar);

module.exports = router;
