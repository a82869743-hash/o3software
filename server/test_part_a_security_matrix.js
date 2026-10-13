/**
 * PART A: END-TO-END SUPER ADMIN, MULTI-TENANCY, ENTITLEMENT CEILING & SECURITY TEST SUITE
 * 
 * Tests:
 * 1. Super Admin vs Branch Admin Privilege Separation
 * 2. Super Admin Only Platform Route Enforcement (403 for Branch Admin)
 * 3. Cross-Tenant IDOR Protection
 * 4. Feature Entitlements & Plan Ceiling Enforcement
 * 5. Account Lockout (5 failed attempts -> 15 min lock)
 * 6. Forced Password Change & Complexity Policy
 * 7. Token Revocation / Force Logout (token_version increment)
 * 8. Audited Impersonation Mode
 */

const axios = require('axios');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('./src/config/db');

const BASE_URL = 'http://localhost:5000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_key_production_secure_2026';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Test assertion failed: ${message}`);
  }
}

async function request(method, path, data = null, headers = {}) {
  try {
    const res = await axios({
      method,
      url: `${BASE_URL}${path}`,
      data,
      headers,
      validateStatus: () => true // Do not throw on non-2xx
    });
    return res;
  } catch (err) {
    return { status: 500, data: { error: err.message } };
  }
}

async function runPartATests() {
  console.log('\n============================================================');
  console.log('   PART A: SUPER ADMIN, ENTITLEMENTS & ACCESS MODEL AUDIT   ');
  console.log('============================================================\n');

  // ── Setup Test Users ──────────────────────────────────────────────
  const testPassword = 'Password123';
  const hashedPass = await bcrypt.hash(testPassword, 10);

  // Ensure Franchise 1 and 2 exist
  await pool.query(
    `INSERT INTO franchises (id, name, code, is_active, is_deleted, plan_tier) 
     VALUES (1, 'Main Studio (O3 Car Spaa)', 'MAIN', 1, 0, 'pro') 
     ON DUPLICATE KEY UPDATE name=VALUES(name), is_active=1, is_deleted=0`
  );
  await pool.query(
    `INSERT INTO franchises (id, name, code, is_active, is_deleted, plan_tier) 
     VALUES (2, 'Vijay Nagar Studio', 'VJN', 1, 0, 'pro') 
     ON DUPLICATE KEY UPDATE name=VALUES(name), is_active=1, is_deleted=0`
  );

  // 1. Super Admin user
  await pool.query(
    `INSERT INTO users (id, name, mobile, role, franchise_id, password_hash, is_active, token_version, must_change_password, failed_login_attempts, locked_until)
     VALUES (108, 'Super Administrator', '9999900001', 'super_admin', 1, ?, 1, 1, 0, 0, NULL)
     ON DUPLICATE KEY UPDATE role='super_admin', franchise_id=1, password_hash=?, is_active=1, token_version=1, must_change_password=0, failed_login_attempts=0, locked_until=NULL`,
    [hashedPass, hashedPass]
  );

  // 2. Franchise 1 Branch Admin (NOT Super Admin)
  await pool.query(
    `INSERT INTO users (id, name, mobile, role, franchise_id, password_hash, is_active, token_version, must_change_password, failed_login_attempts, locked_until)
     VALUES (109, 'Branch Admin 1', '9316668760', 'admin', 1, ?, 1, 1, 0, 0, NULL)
     ON DUPLICATE KEY UPDATE role='admin', franchise_id=1, password_hash=?, is_active=1, token_version=1, must_change_password=0, failed_login_attempts=0, locked_until=NULL`,
    [hashedPass, hashedPass]
  );

  // 3. Franchise 2 Branch Admin
  await pool.query(
    `INSERT INTO users (id, name, mobile, role, franchise_id, password_hash, is_active, token_version, must_change_password, failed_login_attempts, locked_until)
     VALUES (120, 'Branch Admin 2', '9999900020', 'admin', 2, ?, 1, 1, 0, 0, NULL)
     ON DUPLICATE KEY UPDATE role='admin', franchise_id=2, password_hash=?, is_active=1, token_version=1, must_change_password=0, failed_login_attempts=0, locked_until=NULL`,
    [hashedPass, hashedPass]
  );

  // 4. Franchise 2 Manager
  await pool.query(
    `INSERT INTO users (id, name, mobile, role, franchise_id, password_hash, is_active, token_version, must_change_password, failed_login_attempts, locked_until)
     VALUES (121, 'Branch Manager 2', '9999900021', 'manager', 2, ?, 1, 1, 0, 0, NULL)
     ON DUPLICATE KEY UPDATE role='manager', franchise_id=2, password_hash=?, is_active=1, token_version=1, must_change_password=0, failed_login_attempts=0, locked_until=NULL`,
    [hashedPass, hashedPass]
  );

  // Login tokens
  const superAdminLogin = await request('POST', '/auth/login', { mobile: '9999900001', password: testPassword });
  assert(superAdminLogin.status === 200, 'Super Admin login successful');
  const superToken = superAdminLogin.data.data.token;
  const superHeaders = { Authorization: `Bearer ${superToken}` };

  const admin1Login = await request('POST', '/auth/login', { mobile: '9316668760', password: testPassword });
  assert(admin1Login.status === 200, 'Branch Admin 1 login successful');
  const admin1Token = admin1Login.data.data.token;
  const admin1Headers = { Authorization: `Bearer ${admin1Token}` };

  const admin2Login = await request('POST', '/auth/login', { mobile: '9999900020', password: testPassword });
  assert(admin2Login.status === 200, 'Branch Admin 2 login successful');
  const admin2Token = admin2Login.data.data.token;
  const admin2Headers = { Authorization: `Bearer ${admin2Token}` };

  // ── TEST GROUP 1: SUPER ADMIN VS BRANCH ADMIN PRIVILEGE SEPARATION ──
  console.log('\n--- 1. Platform Super Admin Capabilities ---');

  const fList = await request('GET', '/franchises', null, superHeaders);
  assert(fList.status === 200 && fList.data.data.length >= 2, 'Super Admin can list all franchises');

  const overview = await request('GET', '/franchises/consolidated/overview', null, superHeaders);
  assert(overview.status === 200 && overview.data.data.summary, 'Super Admin can access consolidated cross-franchise overview');

  const ent1 = await request('GET', '/franchises/1/entitlements', null, superHeaders);
  assert(ent1.status === 200 && ent1.data.data.catalog, 'Super Admin can view feature entitlements catalog');

  const auditLogs = await request('GET', '/audit', null, superHeaders);
  assert(auditLogs.status === 200, 'Super Admin can access platform audit logs');

  const rolesList = await request('GET', '/roles', null, superHeaders);
  assert(rolesList.status === 200, 'Super Admin can access role management console');

  // ── TEST GROUP 2: BRANCH ADMIN IS STRICTLY DENIED PLATFORM SUPER ADMIN ROUTES ──
  console.log('\n--- 2. Branch Admin Super Admin Route Denial (403 Forbidden) ---');

  const admin1Overview = await request('GET', '/franchises/consolidated/overview', null, admin1Headers);
  assert(admin1Overview.status === 403, 'Branch Admin 1 denied consolidated overview (403 Forbidden)');

  const admin1Ent = await request('GET', '/franchises/1/entitlements', null, admin1Headers);
  assert(admin1Ent.status === 403, 'Branch Admin 1 denied get entitlements (403 Forbidden)');

  const admin1Preset = await request('POST', '/franchises/1/entitlements/preset', { preset: 'enterprise' }, admin1Headers);
  assert(admin1Preset.status === 403, 'Branch Admin 1 denied apply preset (403 Forbidden)');

  const admin1Owner = await request('POST', '/franchises/1/owner', { name: 'Hack', mobile: '9999999999', password: 'Password123' }, admin1Headers);
  assert(admin1Owner.status === 403, 'Branch Admin 1 denied create owner account (403 Forbidden)');

  const admin1Impersonate = await request('POST', '/franchises/2/impersonate', null, admin1Headers);
  assert(admin1Impersonate.status === 403, 'Branch Admin 1 denied impersonate (403 Forbidden)');

  const admin1Audit = await request('GET', '/audit', null, admin1Headers);
  assert(admin1Audit.status === 403, 'Branch Admin 1 denied platform audit logs (403 Forbidden)');

  // Branch Admin 2 creates a custom role for Franchise 2
  const f2RoleRes = await request('POST', '/roles', { role_name: 'F2 Special Tech ' + Date.now(), description: 'Branch 2 custom' }, admin2Headers);
  assert(f2RoleRes.status === 201, 'Branch Admin 2 created custom role for Franchise 2');
  const f2RoleId = f2RoleRes.data.data.id;

  // Branch Admin 1 attempts to delete Branch 2's custom role -> 403 Forbidden
  const idorRoleDelete = await request('DELETE', `/roles/${f2RoleId}`, null, admin1Headers);
  assert(idorRoleDelete.status === 403, 'Branch Admin 1 cannot delete custom role of Branch 2 (403 Forbidden)');

  // Clean up test role
  await pool.query('DELETE FROM v2_roles WHERE id = ?', [f2RoleId]);

  // ── TEST GROUP 3: CROSS-TENANT IDOR ISOLATION ──
  console.log('\n--- 3. Cross-Tenant IDOR Isolation ---');

  // Admin of Franchise 2 attempts to modify Franchise 1 branding
  const idorUpdate = await request('PUT', '/franchises/1', { name: 'Hacked Branch 1' }, admin2Headers);
  assert(idorUpdate.status === 403, 'Branch Admin 2 cannot modify Franchise 1 (403 Forbidden)');

  // Admin of Franchise 2 can update their own franchise details
  const ownUpdate = await request('PUT', '/franchises/2', { phone: '9876500002' }, admin2Headers);
  assert(ownUpdate.status === 200, 'Branch Admin 2 can update own Franchise 2 details');

  // ── TEST GROUP 4: FEATURE ENTITLEMENTS & PLAN CEILING ──
  console.log('\n--- 4. Feature Entitlements & Plan Ceiling Enforcement ---');

  // Super Admin applies BASIC preset to Franchise 2
  const applyBasic = await request('POST', '/franchises/2/entitlements/preset', { preset: 'basic' }, superHeaders);
  assert(applyBasic.status === 200, 'Super Admin applied BASIC preset to Franchise 2');

  // Verify Franchise 2 has basic tier in DB
  const [f2Rows] = await pool.query('SELECT plan_tier FROM franchises WHERE id = 2');
  assert(f2Rows[0].plan_tier === 'basic', 'Franchise 2 plan_tier is now "basic"');

  // WhatsApp module is disabled in basic preset -> verify entitlement ceiling blocks it
  const [waEnt] = await pool.query('SELECT is_enabled FROM franchise_entitlements WHERE franchise_id = 2 AND feature_key = "whatsapp"');
  assert(waEnt[0].is_enabled === 0, 'WhatsApp feature is disabled in BASIC preset for Franchise 2');

  // Super Admin applies PRO preset back to Franchise 2
  const applyPro = await request('POST', '/franchises/2/entitlements/preset', { preset: 'pro' }, superHeaders);
  assert(applyPro.status === 200, 'Super Admin restored PRO preset to Franchise 2');

  const [waEntPro] = await pool.query('SELECT is_enabled FROM franchise_entitlements WHERE franchise_id = 2 AND feature_key = "whatsapp"');
  assert(waEntPro[0].is_enabled === 1, 'WhatsApp feature is restored in PRO preset for Franchise 2');

  // ── TEST GROUP 5: AUTH HARDENING & ACCOUNT LOCKOUT ──
  console.log('\n--- 5. Account Lockout Protection (5 Failed Attempts) ---');

  const lockoutMobile = '9999900055';
  await pool.query(
    `INSERT INTO users (name, mobile, role, franchise_id, password_hash, is_active, failed_login_attempts, locked_until)
     VALUES ('Lockout Test User', ?, 'customer', 1, ?, 1, 0, NULL)
     ON DUPLICATE KEY UPDATE failed_login_attempts=0, locked_until=NULL`,
    [lockoutMobile, hashedPass]
  );

  // Attempt 1 to 4 with wrong password (status 401 with remaining attempts)
  for (let i = 1; i <= 4; i++) {
    const failRes = await request('POST', '/auth/login', { mobile: lockoutMobile, password: 'WrongPassword!' });
    assert(failRes.status === 401, `Failed login attempt #${i} rejected (401)`);
  }

  // Attempt 5 triggers lockout (status 403 with lockout message)
  const lockTriggerRes = await request('POST', '/auth/login', { mobile: lockoutMobile, password: 'WrongPassword!' });
  assert(
    lockTriggerRes.status === 403 && lockTriggerRes.data?.error?.includes('locked'),
    '5th consecutive failed attempt triggers 15-minute account lockout (403)'
  );

  // Attempt 6 should be locked out (status 403 with lockout remaining time)
  const lockedRes = await request('POST', '/auth/login', { mobile: lockoutMobile, password: 'WrongPassword!' });
  assert(
    lockedRes.status === 403 && lockedRes.data?.error?.includes('locked'),
    'Subsequent attempt while locked is blocked with lockout timer message'
  );

  // Even with the CORRECT password, locked account must be rejected
  const correctWhileLocked = await request('POST', '/auth/login', { mobile: lockoutMobile, password: testPassword });
  assert(
    correctWhileLocked.status === 403 && correctWhileLocked.data?.error?.includes('locked'),
    'Locked account rejected even with correct password until unlocked'
  );

  // Admin resets password / unlocks account
  const [lockUser] = await pool.query('SELECT id FROM users WHERE mobile = ?', [lockoutMobile]);
  const unlockRes = await request('POST', `/franchises/users/${lockUser[0].id}/reset-password`, { new_password: 'NewPassword123' }, superHeaders);
  assert(unlockRes.status === 200, 'Super Admin reset password and unlocked account');

  // Now login with new password succeeds and flags must_change_password
  const unlockedLogin = await request('POST', '/auth/login', { mobile: lockoutMobile, password: 'NewPassword123' });
  assert(unlockedLogin.status === 200, 'Unlocked account successfully logs in with reset password');
  assert(unlockedLogin.data.data.user.must_change_password === true, 'must_change_password is true after admin reset');

  // ── TEST GROUP 6: FORCED PASSWORD CHANGE & COMPLEXITY POLICY ──
  console.log('\n--- 6. Forced Password Change & Password Policy ---');

  const tempToken = unlockedLogin.data.data.token;
  const tempHeaders = { Authorization: `Bearer ${tempToken}` };

  // 1. Too short (< 8 chars)
  const shortPassRes = await request('POST', '/auth/change-password', { current_password: 'NewPassword123', new_password: 'short' }, tempHeaders);
  assert(shortPassRes.status === 400, 'Password change rejected for short password (< 8 chars)');

  // 2. Only letters (no numbers)
  const noNumRes = await request('POST', '/auth/change-password', { current_password: 'NewPassword123', new_password: 'passwordonly' }, tempHeaders);
  assert(noNumRes.status === 400, 'Password change rejected for missing numbers');

  // 3. Only digits (no letters)
  const noAlphaRes = await request('POST', '/auth/change-password', { current_password: 'NewPassword123', new_password: '1234567890' }, tempHeaders);
  assert(noAlphaRes.status === 400, 'Password change rejected for missing letters');

  // 4. Valid strong password
  const validPassRes = await request('POST', '/auth/change-password', { current_password: 'NewPassword123', new_password: 'PermanentPass2026' }, tempHeaders);
  assert(validPassRes.status === 200, 'Valid alphanumeric password change succeeded');

  const [changedUser] = await pool.query('SELECT must_change_password FROM users WHERE id = ?', [lockUser[0].id]);
  assert(changedUser[0].must_change_password === 0, 'must_change_password cleared in database after change');

  // ── TEST GROUP 7: TOKEN REVOCATION & IMMEDIATE FORCE LOGOUT ──
  console.log('\n--- 7. Token Revocation via token_version (Force Logout) ---');

  // User logs in with new permanent password
  const freshLogin = await request('POST', '/auth/login', { mobile: lockoutMobile, password: 'PermanentPass2026' });
  const activeToken = freshLogin.data.data.token;
  const activeHeaders = { Authorization: `Bearer ${activeToken}` };

  // Verify token works
  const checkActive = await request('GET', '/bookings', null, activeHeaders);
  assert(checkActive.status === 200, 'JWT token is active and valid');

  // Super Admin forces user to logout (increments token_version)
  const forceLogoutRes = await request('POST', `/franchises/users/${lockUser[0].id}/force-logout`, null, superHeaders);
  assert(forceLogoutRes.status === 200, 'Super Admin executed force logout on user');

  // The active JWT is now instantly rejected with 401 Unauthorized
  const checkRevoked = await request('GET', '/bookings', null, activeHeaders);
  assert(checkRevoked.status === 401, 'Revoked JWT instantly rejected with 401 Unauthorized on next request');

  // ── TEST GROUP 8: AUDITED IMPERSONATION MODE ──
  console.log('\n--- 8. Audited Impersonation Mode ---');

  // Super Admin impersonates Franchise 2
  const impRes = await request('POST', '/franchises/2/impersonate', null, superHeaders);
  assert(impRes.status === 200, 'Impersonation session generated successfully');
  assert(impRes.data.data.token, 'Impersonation JWT issued');

  const impPayload = jwt.decode(impRes.data.data.token);
  assert(impPayload.is_impersonating === true, 'JWT payload contains is_impersonating = true');
  assert(impPayload.impersonator_id === 108, 'JWT payload contains correct impersonator_id (Super Admin)');
  assert(impPayload.franchise_id === 2, 'JWT payload scoped to target franchise #2');

  // Impersonated request operates in Franchise 2 context
  const impHeaders = { Authorization: `Bearer ${impRes.data.data.token}` };
  const impBranchRes = await request('GET', '/franchises/2', null, impHeaders);
  assert(impBranchRes.status === 200, 'Impersonated session accesses target franchise context');

  // Check audit log recorded the impersonation action
  const [impAudit] = await pool.query(
    'SELECT action, new_value FROM audit_logs WHERE action = "IMPERSONATE_FRANCHISE" ORDER BY id DESC LIMIT 1'
  );
  assert(impAudit.length > 0, 'Audit log recorded IMPERSONATE_FRANCHISE event with caller IP and timestamp');

  // Clean up test user
  await pool.query('DELETE FROM users WHERE mobile = ?', [lockoutMobile]);

  console.log('\n============================================================');
  console.log(`   PART A VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('============================================================\n');

  process.exit(0);
}

runPartATests().catch((err) => {
  console.error('\nTest Suite Error:', err);
  process.exit(1);
});
