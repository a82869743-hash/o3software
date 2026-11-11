const bcrypt = require('bcryptjs');
const { guessCarCategory } = require('../utils/carCategory');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { awardWelcomeRewardInternal } = require('./customerRewardsController');

const generateToken = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('FATAL ERROR: JWT_SECRET environment variable is missing. Cannot generate tokens.');
  }
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      name: user.name,
      mobile: user.mobile,
      franchise_id: user.franchise_id || 1,
      token_version: user.token_version || 1
    },
    process.env.JWT_SECRET,
    // customers stay signed in like any app; studio logins renew while in use and end after inactivity
    { expiresIn: user.role === 'customer' ? '30d' : '12h' }
  );
};

/**
 * POST /auth/register
 * Body: { name, mobile, password }
 */
exports.register = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { name, mobile, password, car_brand, car_model, car_reg_no, referral_code, whatsapp_number } = req.body;

    // Validate required fields (the first car is required too — prices and bookings depend on it)
    if (!name || !mobile || !password) {
      return res.status(400).json({ success: false, error: 'Name, mobile, and password are required' });
    }
    if (!car_brand || !String(car_brand).trim() || !car_model || !String(car_model).trim() || !car_reg_no || !String(car_reg_no).trim()) {
      return res.status(400).json({ success: false, error: 'Car brand, model and registration number are required', field: 'car' });
    }
    const waClean = whatsapp_number ? String(whatsapp_number).replace(/\D/g, '').slice(-10) : '';
    if (whatsapp_number && !/^[6-9]\d{9}$/.test(waClean)) {
      return res.status(400).json({ success: false, error: 'Enter a valid 10-digit WhatsApp number', field: 'whatsapp_number' });
    }

    const { isValidMobile } = require('../utils/validators');
    if (!isValidMobile(mobile)) return res.status(400).json({ success: false, error: 'Enter a valid 10-digit mobile number' });
    if (String(password).length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters with letters and numbers' });
    }
    // Clean and normalize mobile number (strip non-digits and take last 10 digits)
    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);

    // No OTP at sign-up (studio's choice). A number the studio already registered at the counter can NOT be
    // claimed here — that would hand its job cards and packages to whoever types the number. Those customers
    // use Forgot Password, which proves the number with a WhatsApp code.

    {
      const { validateRegNo } = require('../utils/validators');
      const rc = validateRegNo(car_reg_no);
      if (!rc.valid) return res.status(400).json({ success: false, error: rc.error, field: 'car_reg_no' });
      const [[taken]] = await conn.query(
        "SELECT v.id FROM vehicles v JOIN users u ON u.id = v.customer_id WHERE v.registration_no = ? AND u.mobile <> ?", [rc.value, cleanMobile]);
      if (taken) return res.status(409).json({ success: false, error: `${rc.value} is already registered to another customer. Please contact the studio.`, field: 'car_reg_no' });
    }

    // Check if mobile already exists
    const [existing] = await conn.query('SELECT id, password_hash FROM users WHERE mobile = ?', [cleanMobile]);
    
    let isManualActivation = false;
    let existingUserId = null;

    if (existing.length > 0) {
      const userRec = existing[0];
      if (userRec.password_hash === 'manual') {
        return res.status(409).json({ success: false, code: 'USE_FORGOT_PASSWORD', field: 'mobile',
          error: 'This number is already registered with O3 Car Spaa. Tap "Forgot Password" on the sign-in page to set your password.' });
      }
      return res.status(409).json({ success: false, field: 'mobile', error: 'This mobile is already registered. Please sign in, or use Forgot Password.' });
    }

    await conn.beginTransaction();

    // Validate referral code if provided
    let referrerId = null;
    let referrerRewardPoints = 100;
    let refCodeRecord = null;

    if (referral_code) {
      const [codes] = await conn.query(
        'SELECT * FROM referral_codes WHERE code = ? AND is_active = 1',
        [(referral_code ? referral_code.trim().toUpperCase() : inviteCode)]
      );

      if (!codes.length) {
        await conn.rollback();
        return res.status(400).json({ success: false, error: 'Invalid or inactive referral code' });
      }

      refCodeRecord = codes[0];

      // Check self-referral
      const [referrerUser] = await conn.query('SELECT mobile FROM users WHERE id = ?', [refCodeRecord.customer_id]);
      if (referrerUser.length && referrerUser[0].mobile === cleanMobile) {
        await conn.rollback();
        return res.status(400).json({ success: false, error: 'Cannot refer yourself' });
      }

      // Check usage limits
      if (refCodeRecord.current_uses >= refCodeRecord.max_uses) {
        await conn.rollback();
        return res.status(400).json({ success: false, error: 'Referral code usage limit reached' });
      }

      referrerId = refCodeRecord.customer_id;
      referrerRewardPoints = refCodeRecord.reward_points;
    }

    let inviteCode = null;
    // No code typed, but a customer referred this number with "Refer a friend" → they are the referrer
    if (!referrerId) {
      const [[inv]] = await conn.query(
        `SELECT ri.referrer_user_id, u.referral_code FROM referral_invites ri JOIN users u ON u.id = ri.referrer_user_id
         WHERE ri.friend_mobile = ? AND ri.referrer_type = 'customer' ORDER BY ri.id DESC LIMIT 1`, [cleanMobile]
      ).catch(() => [[null]]);
      if (inv) { referrerId = inv.referrer_user_id; inviteCode = inv.referral_code || 'INVITE'; }
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);
    
    // Default role
    const role = 'customer';

    // The studio the customer chose (must be an active one); defaults to the main studio
    let franchiseId = 1;
    if (req.body.franchise_id) {
      const [[fr]] = await conn.query('SELECT id FROM franchises WHERE id = ? AND is_active = 1 AND (is_deleted = 0 OR is_deleted IS NULL)', [req.body.franchise_id]);
      if (!fr) { await conn.rollback(); return res.status(400).json({ success: false, error: 'Choose a studio from the list', field: 'franchise_id' }); }
      franchiseId = fr.id;
    }

    // Generate unique referral code for new customer
    const userCode = 'O3' + Math.random().toString(36).substring(2, 8).toUpperCase();

    let userId;
    if (isManualActivation) {
      // Update existing manually created user record with hashed password, name, and referral code
      await conn.query(
        'UPDATE users SET name = ?, password_hash = ?, referral_code = IFNULL(referral_code, ?), referred_by = IFNULL(referred_by, ?) WHERE id = ?',
        [name.trim(), password_hash, userCode, referrerId, existingUserId]
      );
      userId = existingUserId;
      console.log(`[AUTH] Activated manually registered customer ${userId}`);
    } else {
      // Insert new user
      const [result] = await conn.query(
        'INSERT INTO users (name, mobile, password_hash, role, referral_code, referred_by, franchise_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [name.trim(), cleanMobile, password_hash, role, userCode, referrerId, franchiseId]
      );
      userId = result.insertId;
      console.log(`[AUTH] Created new customer ${userId}`);
    }
    // separate WhatsApp number (empty = same as mobile)
    await conn.query('UPDATE users SET whatsapp_number = ? WHERE id = ?', [waClean && waClean !== cleanMobile ? waClean : null, userId]);

    // Create unique referral code entry in referral_codes table (only if not exists)
    let referralPointsSetting = 100;
    const [settingRow] = await conn.query('SELECT value FROM settings WHERE key_name = "referral_referrer_points"');
    if (settingRow.length) {
      referralPointsSetting = parseInt(settingRow[0].value) || 100;
    }

    const [existingCodes] = await conn.query('SELECT id FROM referral_codes WHERE customer_id = ?', [userId]);
    if (existingCodes.length === 0) {
      await conn.query(
        'INSERT INTO referral_codes (customer_id, code, reward_points, max_uses, current_uses, is_active) VALUES (?, ?, ?, 10, 0, 1)',
        [userId, userCode, referralPointsSetting]
      );
    }

    // Save referral links if provided
    if (referrerId) {
      // 1. Insert into v2_referrals (Phase 2 schema)
      await conn.query(
        `INSERT INTO v2_referrals (referrer_id, referred_id, referral_code, status, reward_given) 
         VALUES (?, ?, ?, 'pending', 0)`,
        [referrerId, userId, (referral_code ? referral_code.trim().toUpperCase() : inviteCode)]
      );

      // 2. Insert into referral_rewards (legacy schema)
      await conn.query(
        `INSERT INTO referral_rewards (referrer_id, referred_id, referral_code, reward_type, reward_value, status) 
         VALUES (?, ?, ?, 'points', ?, 'pending')`,
        [referrerId, userId, (referral_code ? referral_code.trim().toUpperCase() : inviteCode), referrerRewardPoints]
      );

      // 3. Update uses count on referrer's code (not for "Refer a friend" sign-ups, which used no code)
      if (refCodeRecord) {
        await conn.query(
          'UPDATE referral_codes SET current_uses = current_uses + 1 WHERE id = ?',
          [refCodeRecord.id]
        );
      }
    }

    // ─── Save car during registration (if provided and they don't already have one) ─────────
    if (car_brand && car_model) {
      const [existingVehicles] = await conn.query('SELECT id FROM vehicles WHERE customer_id = ?', [userId]);
      if (existingVehicles.length === 0) {
        await conn.query(
          `INSERT INTO vehicles (customer_id, brand, model, registration_no, is_primary, category)
           VALUES (?, ?, ?, ?, 1, ?)`,
          [userId, car_brand.trim(), car_model.trim(), car_reg_no?.toUpperCase().trim() || null, guessCarCategory(car_brand, car_model) || 'sedan']
        );
        console.log(`Car saved for user ${userId}: ${car_brand} ${car_model}`);
      }
    }

    // Award Welcome Reward automatically
    await awardWelcomeRewardInternal(userId, conn);

    await conn.commit();

    const user = { id: userId, name: name.trim(), mobile: cleanMobile, role };
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      data: { user, token }
    });
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch (rollbackErr) { console.error('Rollback failed:', rollbackErr); }
    }
    console.error('Register SQL/Server error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: 'Mobile already registered' });
    }
    res.status(500).json({ success: false, error: 'Internal server error during registration' });
  } finally {
    if (conn) conn.release();
  }
};

/**
 * POST /auth/login
 * Body: { mobile, password }
 */
/**
 * POST /auth/login
 * Body: { mobile, password }
 */
exports.login = async (req, res) => {
  try {
    const { mobile, password } = req.body;

    if (!mobile || !password) {
      return res.status(400).json({ success: false, error: 'Mobile and password are required' });
    }

    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);

    const [users] = await pool.query('SELECT * FROM users WHERE mobile = ? AND is_deleted = 0', [cleanMobile]);
    if (!users.length) {
      return res.status(401).json({ success: false, error: 'Invalid credentials: User not found' });
    }

    const u = users[0];

    // Check account active status
    if (u.is_active === 0) {
      return res.status(403).json({ success: false, error: 'Account has been disabled. Please contact your studio administrator.' });
    }
    if (!['super_admin', 'customer'].includes(u.role)) {
      const [[st]] = await pool.query('SELECT is_active, is_deleted FROM franchises WHERE id = ?', [u.franchise_id || 1]);
      if (!st || st.is_deleted === 1 || st.is_active === 0) {
        return res.status(403).json({ success: false, error: 'This studio is closed. Please contact the main office.' });
      }
    }

    // Check account lockout
    if (u.locked_until && new Date(u.locked_until) > new Date()) {
      const waitMinutes = Math.ceil((new Date(u.locked_until).getTime() - Date.now()) / 60000);
      return res.status(403).json({
        success: false,
        error: `Account is temporarily locked due to multiple failed login attempts. Please try again in ${waitMinutes} minute(s).`
      });
    }

    // Strict bcrypt password verification ('manual' = admin-created account not yet activated)
    const isMatch = u.password_hash && u.password_hash !== 'manual' && (await bcrypt.compare(password, u.password_hash));
    if (!isMatch) {
      const failed = (u.failed_login_attempts || 0) + 1;
      if (failed >= 5) {
        await pool.query('UPDATE users SET failed_login_attempts = ?, locked_until = DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE id = ?', [failed, u.id]);
        return res.status(403).json({
          success: false,
          error: 'Account locked for 15 minutes due to 5 consecutive failed login attempts.'
        });
      } else {
        await pool.query('UPDATE users SET failed_login_attempts = ? WHERE id = ?', [failed, u.id]);
        return res.status(401).json({
          success: false,
          error: `Invalid credentials. (${5 - failed} attempt(s) remaining before temporary lockout)`
        });
      }
    }

    // Reset failed login attempts on successful authentication
    await pool.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?', [u.id]);

    const userObj = {
      id: u.id,
      name: u.name,
      mobile: u.mobile,
      role: u.role,
      franchise_id: u.franchise_id || 1,
      token_version: u.token_version || 1,
      must_change_password: u.must_change_password === 1
    };

    const token = generateToken(userObj);
    try {
      const { getEffectivePermissions } = require('../middleware/accessControl');
      userObj.permissions = await getEffectivePermissions({ ...userObj, custom_role_id: u.custom_role_id });
    } catch { userObj.permissions = []; }

    // Audit log
    try {
      const { logAudit } = require('./auditController');
      await logAudit(u.id, 'LOGIN_SUCCESS', 'user', u.id, { role: u.role, franchise_id: u.franchise_id }, req.ip);
    } catch {}

    res.json({
      success: true,
      data: {
        user: userObj,
        token,
        must_change_password: u.must_change_password === 1
      }
    });
  } catch (err) {
    console.error('Login SQL/Server error:', err);
    res.status(500).json({ success: false, error: 'Internal server error during login' });
  }
};

/**
 * GET /auth/me
 * Auth: Any
 */
exports.getMe = async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT u.id, u.name, u.mobile, u.email, u.role, u.franchise_id, u.is_active, u.created_at, u.opt_out_promotional, u.address, u.whatsapp_number,
              u.custom_role_id, u.profile_picture, u.must_change_password, u.referral_code,
              f.name AS franchise_name, r.role_name AS custom_role_name
       FROM users u
       LEFT JOIN franchises f ON f.id = u.franchise_id
       LEFT JOIN v2_roles r ON r.id = u.custom_role_id
       WHERE u.id = ? AND u.is_deleted = 0`,
      [req.user.id]
    );
    if (!users.length) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const user = users[0];
    if (req.isImpersonating) {
      user.role = req.user.role;
      user.franchise_id = req.user.franchise_id;
    }

    let loyalty = null;
    if (user.role === 'customer') {
      const [loyaltyRows] = await pool.query(
        'SELECT credits, free_washes, wax_count, updated_at FROM loyalty WHERE customer_id = ?',
        [user.id]
      );
      if (loyaltyRows.length) loyalty = loyaltyRows[0];
    }

    const { getEffectivePermissions } = require('../middleware/accessControl');
    const permissions = await getEffectivePermissions({ ...req.user, ...user });

    res.json({
      success: true,
      data: { ...user, must_change_password: user.must_change_password === 1, loyalty, permissions },
    });
  } catch (err) {
    console.error('GetMe error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch user' });
  }
};

/**
 * PUT /auth/profile
 * Auth: Any
 * Body: { name, email, address }
 */
exports.updateProfile = async (req, res) => {
  try {
    const { name, email, address, opt_out_promotional, whatsapp_number } = req.body;
    const userId = req.user.id;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).trim())) {
      return res.status(400).json({ success: false, error: 'Enter a valid email address' });
    }
    if (whatsapp_number !== undefined) {
      const wa = String(whatsapp_number || '').replace(/\D/g, '').slice(-10);
      if (wa && !/^[6-9]\d{9}$/.test(wa)) return res.status(400).json({ success: false, error: 'Enter a valid 10-digit WhatsApp number' });
      const [[me]] = await pool.query('SELECT mobile FROM users WHERE id = ?', [userId]);
      await pool.query('UPDATE users SET whatsapp_number = ? WHERE id = ?', [wa && wa !== me?.mobile ? wa : null, userId]);
    }

    // address is printed on invoices (users.address — added by the startup schema)
    await pool.query(
      'UPDATE users SET name = ?, email = ?, opt_out_promotional = ?, address = COALESCE(?, address) WHERE id = ?',
      [name, email ? String(email).trim() : null, opt_out_promotional ? 1 : 0, address !== undefined ? String(address || '').trim().slice(0, 300) || null : null, userId]
    );

    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Update Profile error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: 'Email already in use' });
    }
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
};

/**
 * POST /auth/profile/picture
 * Auth: Any
 * Upload profile picture (multipart/form-data, field: "picture")
 */
exports.uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }

    // Build the public URL path
    const urlPath = `/uploads/${req.file.filename}`;

    await pool.query(
      'UPDATE users SET profile_picture = ? WHERE id = ?',
      [urlPath, req.user.id]
    );

    res.json({
      success: true,
      data: { profile_picture: urlPath },
      message: 'Profile picture updated'
    });
  } catch (err) {
    console.error('Upload profile picture error:', err);
    res.status(500).json({ success: false, error: 'Failed to upload profile picture' });
  }
};

/**
 * POST /auth/change-password
 * Auth: Any
 * Body: { old_password, new_password, current_password }
 */
exports.changePassword = async (req, res) => {
  try {
    if (req.user.role !== 'customer' && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Your password is set by your admin. Ask them if you need a new one.', code: 'TEAM_PASSWORD' });
    }
    const oldPass = req.body.old_password || req.body.current_password;
    const newPass = req.body.new_password;

    if (!newPass) {
      return res.status(400).json({ success: false, error: 'New password is required' });
    }

    // Password policy: at least 8 characters, letters and numbers
    if (newPass.length < 8 || !/\d/.test(newPass) || !/[a-zA-Z]/.test(newPass)) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 8 characters long and contain both letters and numbers.'
      });
    }

    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!users.length) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const u = users[0];

    const valid = u.password_hash === 'manual' || (!!oldPass && await bcrypt.compare(oldPass, u.password_hash));
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPass, 10);
    const newVersion = (u.token_version || 1) + 1;

    await pool.query(
      'UPDATE users SET password_hash = ?, must_change_password = 0, token_version = ? WHERE id = ?',
      [newHash, newVersion, req.user.id]
    );

    const updatedUser = {
      id: u.id,
      name: u.name,
      mobile: u.mobile,
      role: u.role,
      franchise_id: u.franchise_id || 1,
      token_version: newVersion,
      must_change_password: false
    };
    const newToken = generateToken(updatedUser);

    res.json({
      success: true,
      data: { token: newToken, user: updatedUser },
      message: 'Password changed successfully'
    });
  } catch (err) {
    console.error('ChangePassword error:', err);
    res.status(500).json({ success: false, error: 'Password change failed' });
  }
};

/**
 * POST /auth/logout
 * Invalides token version immediately in database
 */
exports.logout = async (req, res) => {
  try {
    if (req.user && req.user.id) {
      await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [req.user.id]);
    }
    res.json({ success: true, message: 'Logged out successfully. Session invalidated.' });
  } catch (err) {
    res.json({ success: true, message: 'Logged out' });
  }
};

/**
 * POST /auth/admin/create-customer
 * Auth: Admin only
 * Body: { name, mobile, email?, password? }
 * Creates a customer account manually (admin flow)
 */
exports.adminCreateCustomer = async (req, res) => {
  try {
    const { name, mobile, email, password } = req.body;

    if (!name || !mobile) {
      return res.status(400).json({ success: false, error: 'Name and mobile are required' });
    }

    // Check if mobile already exists
    const [existing] = await pool.query('SELECT id FROM users WHERE mobile = ?', [mobile]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, error: 'Mobile already registered' });
    }

    // Generate default password if not provided
    const defaultPassword = password || mobile.slice(-4) + 'O3CS';
    const password_hash = await bcrypt.hash(defaultPassword, 10);

    const [result] = await pool.query(
      'INSERT INTO users (name, mobile, email, password_hash, role, franchise_id) VALUES (?, ?, ?, ?, ?, ?)',
      [name.trim(), mobile, email || null, password_hash, 'customer', (Number(req.franchiseId) || Number(req.user?.franchise_id) || 1)]
    );

    const userId = result.insertId;

    // Create loyalty record
    await pool.query('INSERT INTO loyalty (customer_id) VALUES (?)', [userId]);

    // Award Welcome Reward automatically
    try {
      await awardWelcomeRewardInternal(userId);
    } catch (rewardErr) {
      console.error('Failed to award welcome reward during admin customer creation:', rewardErr.message);
    }

    console.log(`[AUTH] Admin created customer #${userId}: ${name} (${mobile})`);

    res.status(201).json({
      success: true,
      data: { id: userId, name: name.trim(), mobile, role: 'customer' },
      message: `Customer created. Default password: ${defaultPassword}`,
    });
  } catch (err) {
    console.error('adminCreateCustomer error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: 'Mobile already registered' });
    }
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * POST /auth/refresh
 * Auth: Any (valid or recently-expired token)
 * Returns a fresh 1h token if the current token is still valid.
 * This enables soft session extension — frontend calls this periodically.
 */
exports.refreshToken = async (req, res) => {
  try {
    // req.user is set by auth middleware (token must still be valid)
    const [users] = await pool.query(
      'SELECT id, name, mobile, role, franchise_id, token_version FROM users WHERE id = ? AND is_active = 1 AND is_deleted = 0',
      [req.user.id]
    );

    if (!users.length) {
      return res.status(401).json({ success: false, error: 'User not found or deactivated' });
    }

    const user = users[0];
    const newToken = generateToken(user);

    res.json({
      success: true,
      data: { token: newToken, user },
    });
  } catch (err) {
    console.error('Token refresh error:', err);
    res.status(500).json({ success: false, error: 'Token refresh failed' });
  }
};

exports.generateToken = generateToken;
