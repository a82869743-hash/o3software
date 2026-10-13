const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const uploadMiddleware = require('../middleware/upload');

// ─── Forgot Password Controller (OTP-based reset) ──────────
const forgotPasswordController = require('../controllers/forgotPasswordController');
const { authLimiter } = require('../middleware/rateLimiter');

// Public routes (Protected against brute-force attacks)
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);

// Forgot Password routes (public — no auth required, rate-limited)
router.post('/forgot-password', authLimiter, forgotPasswordController.forgotPassword);
router.post('/verify-otp', authLimiter, forgotPasswordController.verifyOtp);
router.post('/reset-password', authLimiter, forgotPasswordController.resetPassword);

// Protected routes
router.get('/me', authMiddleware, authController.getMe);
router.put('/profile', authMiddleware, authController.updateProfile);
router.post('/profile/picture', authMiddleware, uploadMiddleware.single('picture'), authController.uploadProfilePicture);
router.post('/change-password', authMiddleware, authController.changePassword);
router.post('/logout', authMiddleware, authController.logout);
router.post('/refresh', authMiddleware, authController.refreshToken);

// Admin routes
const role = require('../middleware/role');
router.post('/admin/create-customer', authMiddleware, role(['admin']), authController.adminCreateCustomer);

module.exports = router;
