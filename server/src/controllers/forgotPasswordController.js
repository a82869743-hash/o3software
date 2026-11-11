/**
 * OTP flows — the ONLY place SMS is used.
 *   POST /auth/forgot-password { mobile }               → SMS OTP (purpose reset)
 *   POST /auth/verify-otp      { mobile, otp }          → { resetToken }
 *   POST /auth/reset-password  { resetToken, newPassword }
 *   POST /auth/otp/send        { mobile }               → SMS OTP (purpose login)
 *   POST /auth/otp/login       { mobile, otp }          → { token, user }  (also activates staff-created customer accounts)
 *
 * OTPs live in MySQL (otp_codes), hashed, 5-minute expiry, 5 attempts, 60s resend cooldown — works across PM2 workers.
 * In development without an SMS key, set OTP_DEV_ECHO=true to receive the OTP in the API response for testing.
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const sendOtp = require('../utils/sendOtp');
const { normalizeMobile, isValidMobile } = require('../utils/validators');

const OTP_TTL_MIN = 5;
const MAX_ATTEMPTS = 5;
const COOLDOWN_SEC = 60;
const viaWa = () => (sendOtp.otpChannel() === 'whatsapp' ? ' on WhatsApp' : '');

const hashOtp = (mobile, otp) => crypto.createHmac('sha256', process.env.JWT_SECRET || 'otp').update(`${mobile}:${otp}`).digest('hex');

async function issueOtp(mobile, purpose) {
  const [[recent]] = await pool.query(
    'SELECT TIMESTAMPDIFF(SECOND, created_at, NOW()) AS age FROM otp_codes WHERE mobile = ? AND purpose = ? ORDER BY id DESC LIMIT 1',
    [mobile, purpose]
  );
  if (recent && recent.age < COOLDOWN_SEC) {
    const err = new Error(`Please wait ${COOLDOWN_SEC - recent.age}s before requesting another OTP`);
    err.status = 429;
    throw err;
  }
  const otp = String(crypto.randomInt(100000, 1000000));
  await pool.query('UPDATE otp_codes SET consumed_at = NOW() WHERE mobile = ? AND purpose = ? AND consumed_at IS NULL', [mobile, purpose]);
  await pool.query(
    `INSERT INTO otp_codes (mobile, purpose, code_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ${OTP_TTL_MIN} MINUTE))`,
    [mobile, purpose, hashOtp(mobile, otp)]
  );
  const sent = await sendOtp(mobile, otp);
  return { otp, sent };
}

async function checkOtp(mobile, purpose, otp) {
  const [[row]] = await pool.query(
    'SELECT * FROM otp_codes WHERE mobile = ? AND purpose = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1',
    [mobile, purpose]
  );
  if (!row) return 'No OTP found. Please request a new one.';
  if (new Date(row.expires_at) < new Date()) return 'OTP has expired. Please request a new one.';
  if (row.attempts >= MAX_ATTEMPTS) return 'Too many wrong attempts. Please request a new OTP.';
  const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(hashOtp(mobile, String(otp || '').trim())));
  if (!ok) {
    await pool.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    return `Invalid OTP. ${MAX_ATTEMPTS - row.attempts - 1} attempt(s) left.`;
  }
  await pool.query('UPDATE otp_codes SET consumed_at = NOW() WHERE id = ?', [row.id]);
  return null;
}

const devEcho = (otp) => (process.env.OTP_DEV_ECHO === 'true' && process.env.NODE_ENV !== 'production' ? { dev_otp: otp } : {});

async function findActiveUser(mobile) {
  const [[u]] = await pool.query('SELECT * FROM users WHERE mobile = ? AND is_deleted = 0', [mobile]);
  return u || null;
}
const TEAM_ONLY_MSG = 'Staff and admin passwords are set by your studio admin (Super Admin for admins). Please ask them to reset it.';
const isTeam = u => u && u.role && u.role !== 'customer';

// ─── 1. FORGOT PASSWORD → OTP ──────────────
exports.forgotPassword = async (req, res) => {
  try {
    if (!isValidMobile(req.body.mobile)) return res.status(400).json({ success: false, error: 'Please enter a valid 10-digit mobile number' });
    const mobile = normalizeMobile(req.body.mobile);
    const user = await findActiveUser(mobile);
    if (isTeam(user)) return res.status(403).json({ success: false, error: TEAM_ONLY_MSG, code: 'TEAM_PASSWORD' });
    // Same response whether or not the number exists (no account enumeration)
    if (!user || !user.is_active) {
      return res.json({ success: true, message: 'If this number is registered, an OTP has been sent.' });
    }
    const { otp, sent } = await issueOtp(mobile, 'reset');
    if (!sent && process.env.NODE_ENV === 'production') return res.status(503).json({ success: false, error: 'We could not send the code right now. Please try again in a few minutes.' });
    res.json({ success: true, message: 'OTP sent to your registered mobile number' + viaWa(), ...devEcho(otp) });
  } catch (err) {
    if (err.status === 429) return res.status(429).json({ success: false, error: err.message });
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, error: 'Failed to process request' });
  }
};

// ─── 2. VERIFY RESET OTP ───────────────────
exports.verifyOtp = async (req, res) => {
  try {
    const mobile = normalizeMobile(req.body.mobile);
    if (!mobile || !req.body.otp) return res.status(400).json({ success: false, error: 'Mobile number and OTP are required' });
    const err = await checkOtp(mobile, 'reset', req.body.otp);
    if (err) return res.status(400).json({ success: false, error: err });
    const user = await findActiveUser(mobile);
    if (isTeam(user)) return res.status(403).json({ success: false, error: TEAM_ONLY_MSG, code: 'TEAM_PASSWORD' });
    if (!user) return res.status(400).json({ success: false, error: 'Account not found' });
    const resetToken = jwt.sign({ uid: user.id, purpose: 'password-reset', tv: user.token_version }, process.env.JWT_SECRET, { expiresIn: '10m' });
    res.json({ success: true, message: 'OTP verified', data: { resetToken } });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ success: false, error: 'Verification failed' });
  }
};

// ─── 3. RESET PASSWORD ─────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword) return res.status(400).json({ success: false, error: 'Reset token and new password are required' });
    if (String(newPassword).length < 8 || !/\d/.test(newPassword) || !/[a-zA-Z]/.test(newPassword)) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters with letters and numbers' });
    }
    let decoded;
    try { decoded = jwt.verify(resetToken, process.env.JWT_SECRET); } catch {
      return res.status(400).json({ success: false, error: 'Reset link expired. Please request a new OTP.' });
    }
    if (decoded.purpose !== 'password-reset' || !decoded.uid) return res.status(400).json({ success: false, error: 'Invalid reset token' });
    const [r] = await pool.query(
      `UPDATE users SET password_hash = ?, must_change_password = 0, failed_login_attempts = 0, locked_until = NULL,
         token_version = token_version + 1 WHERE id = ? AND token_version = ?`,
      [await bcrypt.hash(newPassword, 10), decoded.uid, decoded.tv]
    );
    if (!r.affectedRows) return res.status(400).json({ success: false, error: 'Reset link already used. Please request a new OTP.' });
    res.json({ success: true, message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, error: 'Password reset failed' });
  }
};

// ─── 4. REGISTRATION OTP (verifies the mobile belongs to the person signing up) ──
exports.sendRegisterOtp = async (req, res) => {
  try {
    if (!isValidMobile(req.body.mobile)) return res.status(400).json({ success: false, error: 'Please enter a valid 10-digit mobile number' });
    const mobile = normalizeMobile(req.body.mobile);
    const user = await findActiveUser(mobile);
    if (isTeam(user)) return res.status(403).json({ success: false, error: 'This number already belongs to a studio staff or admin account. Please sign up with a different mobile number.', code: 'TEAM_NUMBER' });
    if (user && user.password_hash !== 'manual') {
      return res.status(409).json({ success: false, error: 'This mobile is already registered. Please log in (or use Forgot password).' });
    }
    const { otp, sent } = await issueOtp(mobile, 'register');
    if (!sent && process.env.NODE_ENV === 'production') return res.status(503).json({ success: false, error: 'We could not send the code right now. Please try again in a few minutes.' });
    res.json({ success: true, message: 'OTP sent to your mobile number' + viaWa(), ...devEcho(otp) });
  } catch (err) {
    if (err.status === 429) return res.status(429).json({ success: false, error: err.message });
    console.error('Send register OTP error:', err);
    res.status(500).json({ success: false, error: 'Failed to send OTP' });
  }
};
exports.checkOtp = checkOtp;

// ─── 5. LOGIN WITH OTP ─────────────────────
exports.sendLoginOtp = async (req, res) => {
  try {
    if (!isValidMobile(req.body.mobile)) return res.status(400).json({ success: false, error: 'Please enter a valid 10-digit mobile number' });
    const mobile = normalizeMobile(req.body.mobile);
    const user = await findActiveUser(mobile);
    if (isTeam(user)) return res.status(403).json({ success: false, error: TEAM_ONLY_MSG, code: 'TEAM_PASSWORD' });
    if (!user || !user.is_active) {
      return res.json({ success: true, message: 'If this number is registered, an OTP has been sent.' });
    }
    const { otp, sent } = await issueOtp(mobile, 'login');
    if (!sent && process.env.NODE_ENV === 'production') return res.status(503).json({ success: false, error: 'We could not send the code right now. Please try again in a few minutes.' });
    res.json({ success: true, message: 'OTP sent to your mobile number' + viaWa(), ...devEcho(otp) });
  } catch (err) {
    if (err.status === 429) return res.status(429).json({ success: false, error: err.message });
    console.error('Send login OTP error:', err);
    res.status(500).json({ success: false, error: 'Failed to send OTP' });
  }
};

exports.loginWithOtp = async (req, res) => {
  try {
    const mobile = normalizeMobile(req.body.mobile);
    if (!mobile || !req.body.otp) return res.status(400).json({ success: false, error: 'Mobile number and OTP are required' });
    const err = await checkOtp(mobile, 'login', req.body.otp);
    if (err) return res.status(400).json({ success: false, error: err });
    const u = await findActiveUser(mobile);
    if (isTeam(u)) return res.status(403).json({ success: false, error: TEAM_ONLY_MSG, code: 'TEAM_PASSWORD' });
    if (!u || !u.is_active) return res.status(403).json({ success: false, error: 'Account is disabled' });
    await pool.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?', [u.id]);

    const userObj = {
      id: u.id, name: u.name, mobile: u.mobile, role: u.role, franchise_id: u.franchise_id || 1,
      token_version: u.token_version || 1,
      // Staff-created customer accounts have no password yet → ask them to set one
      must_change_password: u.must_change_password === 1 || u.password_hash === 'manual',
    };
    const token = jwt.sign(
      { id: userObj.id, role: userObj.role, name: userObj.name, mobile: userObj.mobile, franchise_id: userObj.franchise_id, token_version: userObj.token_version },
      process.env.JWT_SECRET, { expiresIn: userObj.role === 'customer' ? '30d' : '12h' }
    );
    try {
      const { getEffectivePermissions } = require('../middleware/accessControl');
      userObj.permissions = await getEffectivePermissions({ ...userObj, custom_role_id: u.custom_role_id });
    } catch { userObj.permissions = []; }
    try { await require('./auditController').logAudit(u.id, 'LOGIN_OTP', 'user', u.id, { role: u.role }, req.ip); } catch { /* best effort */ }
    res.json({ success: true, data: { token, user: userObj, must_change_password: userObj.must_change_password } });
  } catch (err) {
    console.error('OTP login error:', err);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
};
