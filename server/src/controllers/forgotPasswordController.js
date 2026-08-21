/**
 * ─── FORGOT PASSWORD CONTROLLER ─────────────────────────────
 * Handles OTP-based password reset flow:
 *   1. POST /auth/forgot-password  → Generate & send OTP
 *   2. POST /auth/verify-otp       → Verify OTP, return reset token
 *   3. POST /auth/reset-password   → Use reset token to set new password
 *
 * OTPs are stored in-memory (Map) with 5-minute TTL.
 * When MSG91_AUTH_KEY is configured, OTP is sent via SMS.
 * Otherwise, OTP is logged to console (development mode).
 *
 * ⚠️  This file is ADDITIVE — it does NOT modify existing auth logic.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// ─── In-memory OTP store ────────────────────────────────────
// Key: mobile number, Value: { otp, expiresAt, attempts }
const otpStore = new Map();

// Configuration
const OTP_LENGTH = 4;
const OTP_EXPIRY_MS = 5 * 60 * 1000;      // 5 minutes
const MAX_OTP_ATTEMPTS = 5;                 // Max verify attempts per OTP
const RESET_TOKEN_EXPIRY = '10m';           // JWT expiry for reset token
const COOLDOWN_MS = 60 * 1000;             // 1 minute cooldown between OTP requests

/**
 * Generate a random numeric OTP of specified length
 */
function generateOTP(length = OTP_LENGTH) {
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += Math.floor(Math.random() * 10);
  }
  return otp;
}

/**
 * Clean up expired OTPs periodically (every 10 minutes)
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of otpStore.entries()) {
    if (now > val.expiresAt) {
      otpStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

// ─── 1. FORGOT PASSWORD (Send OTP) ─────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const { mobile } = req.body;

    // Clean and normalize mobile number (strip non-digits and take last 10 digits)
    const cleanMobile = mobile ? mobile.replace(/\D/g, '').slice(-10) : '';

    // Validate mobile
    if (!cleanMobile || !/^[0-9]{10}$/.test(cleanMobile)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid 10-digit mobile number',
      });
    }

    // Check if user exists
    const [users] = await pool.query(
      'SELECT id, name FROM users WHERE mobile = ?',
      [cleanMobile]
    );
    if (!users.length) {
      return res.status(404).json({
        success: false,
        error: 'No account found with this mobile number',
      });
    }

    // Cooldown check — prevent OTP spam
    const existing = otpStore.get(cleanMobile);
    if (existing && Date.now() - (existing.expiresAt - OTP_EXPIRY_MS) < COOLDOWN_MS) {
      return res.status(429).json({
        success: false,
        error: 'Please wait before requesting another OTP',
      });
    }

    // Generate OTP
    const otp = generateOTP();

    // Store OTP
    otpStore.set(cleanMobile, {
      otp,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
      attempts: 0,
      userId: users[0].id,
    });

    // Send OTP via 2Factor.in SMS
    const sendOtp = require('../utils/sendOtp');
    const sent = await sendOtp(cleanMobile, otp);
    if (!sent) {
      console.error(`[OTP] Failed to send to ${cleanMobile} — OTP is stored, user can retry`);
    }

    res.json({
      success: true,
      message: 'OTP sent to your registered mobile number',
      // In dev mode, include OTP in response for testing
      ...(process.env.NODE_ENV !== 'production' && { dev_otp: otp }),
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, error: 'Failed to process request' });
  }
};

// ─── 2. VERIFY OTP ──────────────────────────────────────────
exports.verifyOtp = async (req, res) => {
  try {
    const { mobile, otp } = req.body;

    // Clean and normalize mobile number
    const cleanMobile = mobile ? mobile.replace(/\D/g, '').slice(-10) : '';

    // Validate input
    if (!cleanMobile || !otp) {
      return res.status(400).json({
        success: false,
        error: 'Mobile number and OTP are required',
      });
    }

    // Get stored OTP
    const stored = otpStore.get(cleanMobile);
    if (!stored) {
      return res.status(400).json({
        success: false,
        error: 'No OTP found. Please request a new one.',
      });
    }

    // Check expiry
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(cleanMobile);
      return res.status(400).json({
        success: false,
        error: 'OTP has expired. Please request a new one.',
      });
    }

    // Check max attempts
    if (stored.attempts >= MAX_OTP_ATTEMPTS) {
      otpStore.delete(cleanMobile);
      return res.status(429).json({
        success: false,
        error: 'Too many failed attempts. Please request a new OTP.',
      });
    }

    // Verify OTP
    if (stored.otp !== otp.toString()) {
      stored.attempts += 1;
      return res.status(400).json({
        success: false,
        error: `Invalid OTP. ${MAX_OTP_ATTEMPTS - stored.attempts} attempts remaining.`,
      });
    }

    // OTP verified — generate reset token
    const resetToken = jwt.sign(
      { id: stored.userId, mobile: cleanMobile, purpose: 'password-reset' },
      process.env.JWT_SECRET,
      { expiresIn: RESET_TOKEN_EXPIRY }
    );

    // Clear OTP (one-time use)
    otpStore.delete(cleanMobile);

    res.json({
      success: true,
      message: 'OTP verified successfully',
      data: { resetToken },
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ success: false, error: 'Verification failed' });
  }
};

// ─── 3. RESET PASSWORD ─────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    // Validate input
    if (!resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Reset token and new password are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters',
      });
    }

    // Verify reset token
    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token. Please try again.',
      });
    }

    // Ensure token was issued for password reset
    if (decoded.purpose !== 'password-reset') {
      return res.status(400).json({
        success: false,
        error: 'Invalid reset token',
      });
    }

    // Hash new password and update
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [passwordHash, decoded.id]
    );

    res.json({
      success: true,
      message: 'Password reset successfully. You can now log in with your new password.',
    });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, error: 'Password reset failed' });
  }
};
