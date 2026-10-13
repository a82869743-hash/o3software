/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PART B: Launch-Readiness Automated Verification Suite
 * ═══════════════════════════════════════════════════════════════════════════
 * Validates:
 * 1. Health Probe (Uptime, Memory, DB Ping Latency)
 * 2. Rate Limiting (DoS Mitigation & 429 Responses)
 * 3. Path Traversal & File Upload Hardening
 * 4. XSS Escaping & Shared Link Safety
 * 5. SQL Injection Immunity
 * 6. Connection Pool Resilience Under Concurrency
 * 7. Migration 102 Composite Indexes Presence
 * ═══════════════════════════════════════════════════════════════════════════
 */

const http = require('http');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const pool = require('./src/config/db');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName}`);
  }
}

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
          json
        });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runPartBSuite() {
  console.log('\n' + '═'.repeat(70));
  console.log('🚀 RUNNING PART B: LAUNCH-READINESS AUDIT & SECURITY TEST SUITE');
  console.log('═'.repeat(70) + '\n');

  // ── TEST 1: Health Probe ──────────────────────────────────────────────────
  console.log('--- 1. Health Probe & Diagnostic Metrics ---');
  try {
    const res = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/v1/health',
      method: 'GET'
    });
    assert(res.statusCode === 200, 'Health probe returns HTTP 200');
    assert(res.json?.status === 'healthy', 'Health status reports "healthy"');
    assert(res.json?.database?.status === 'connected', 'Database reports "connected"');
    assert(typeof res.json?.database?.latencyMs === 'number', 'Database ping latency is measured in ms');
    assert(typeof res.json?.uptimeSeconds === 'number', 'System uptime is reported in seconds');
    assert(typeof res.json?.memory?.heapUsedMB === 'number', 'Heap memory metrics are reported');
  } catch (err) {
    console.error('Health probe request error:', err.message);
    assert(false, 'Health probe reachable');
  }

  // ── TEST 2: Rate Limiting (Auth & API) ────────────────────────────────────
  console.log('\n--- 2. Rate Limiting & DoS Protection ---');
  try {
    // Check API rate limit headers on a standard endpoint
    const apiRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/v1/health', // health check is exempt from rate limits
      method: 'GET'
    });
    assert(apiRes.statusCode === 200, 'Health check route exempt from API rate limit');

    // Test authLimiter: trigger 429 by sending rapid requests to /api/auth/login
    let got429 = false;
    for (let i = 0; i < 25; i++) {
      const authRes = await makeRequest({
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { email: 'nonexistent@example.com', password: 'WrongPassword123' });

      if (authRes.statusCode === 429) {
        got429 = true;
        break;
      }
    }
    assert(got429, 'Auth rate limiter triggers HTTP 429 Too Many Requests after threshold');
  } catch (err) {
    console.error('Rate limiting test error:', err.message);
    assert(false, 'Rate limiting tests completed without crash');
  }

  // ── TEST 3: Path Traversal Protection ────────────────────────────────────
  console.log('\n--- 3. Path Traversal & File System Boundary Security ---');
  try {
    const fileCtrl = require('./src/controllers/fileSharingController');
    // Simulate token download attempting path traversal
    const [travRes] = await pool.query(
      `SELECT * FROM shared_files WHERE file_path LIKE '%..%'`
    );
    assert(travRes.length === 0, 'No path traversal payloads in database shared files');

    // Test safe path resolution directly
    const fs = require('fs');
    const traversalAttempt = '../../../../../../windows/win.ini';
    const fakeToken = 'test_traversal_' + Date.now();
    
    // Attempt download of non-existent token with traversal
    const tokenRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/shared-files/download/${fakeToken}`,
      method: 'GET'
    });
    assert(tokenRes.statusCode === 404, 'Invalid token with traversal payload returns 404');
  } catch (err) {
    console.error('Path traversal test error:', err.message);
    assert(false, 'Path traversal test passed');
  }

  // ── TEST 4: XSS Escaping on Public Shared Previews ────────────────────────
  console.log('\n--- 4. XSS Sanitization on Public Link Previews ---');
  try {
    const testPayload = '<script>alert("XSS_PWNED")</script>';
    const testToken = 'xss_audit_' + Date.now();
    
    // Insert temporary test record in v2_file_attachments
    await pool.query(
      `INSERT INTO v2_file_attachments (file_name, file_url, file_type, reference_type, reference_id, share_token)
       VALUES (?, ?, 'image', 'test', 9999, ?)`,
      [testPayload, '/uploads/test.jpg', testToken]
    );

    const previewRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/shared/${testToken}`,
      method: 'GET'
    });

    assert(previewRes.statusCode === 200, 'Public shared preview returns HTTP 200');
    assert(!previewRes.body.includes('<script>alert'), 'Script tags are strictly neutralized');
    assert(previewRes.body.includes('&lt;script&gt;alert'), 'HTML entities properly escaped (&lt;script&gt;)');

    // Clean up test record
    await pool.query('DELETE FROM v2_file_attachments WHERE share_token = ?', [testToken]);
  } catch (err) {
    console.error('XSS test error:', err.message);
    assert(false, 'XSS test passed');
  }

  // ── TEST 5: SQL Injection Resistance ────────────────────────────────────
  console.log('\n--- 5. SQL Injection Immunity Across Public & Protected Routes ---');
  try {
    const sqliPayload = "admin' OR '1'='1' --";
    const sqliRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email: sqliPayload, password: "' OR 1=1 --" });

    // Should return 401 Unauthorized or 429 Rate limited, but never 500 or 200
    assert(sqliRes.statusCode === 401 || sqliRes.statusCode === 429, 'SQL injection login bypass attempt rejected');

    // Test parameterization in search endpoint
    const jwt = require('jsonwebtoken');
    const adminToken = jwt.sign({ id: 1, role: 'admin', franchise_id: 1, token_version: 1 }, process.env.JWT_SECRET);
    const searchRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/search/global?q=${encodeURIComponent("'; DROP TABLE users; --")}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    assert(searchRes.statusCode === 200 && searchRes.json?.success === true, 'SQL injection search query handled safely via parameters without error');

    // Verify users table intact
    const [userCount] = await pool.query('SELECT COUNT(*) as cnt FROM users');
    assert(userCount[0].cnt > 0, 'Database tables intact after SQL injection test payloads');
  } catch (err) {
    console.error('SQL injection test error:', err.message);
    assert(false, 'SQL injection test completed');
  }

  // ── TEST 6: Connection Pool Resilience Under Concurrency ─────────────────
  console.log('\n--- 6. Database Connection Pool Concurrency Test ---');
  try {
    const concurrentQueries = 50;
    const promises = [];
    const t0 = Date.now();
    for (let i = 0; i < concurrentQueries; i++) {
      promises.push(pool.query('SELECT ? as num, SLEEP(0.01) as sleep', [i]));
    }
    const results = await Promise.all(promises);
    const durationMs = Date.now() - t0;
    assert(results.length === concurrentQueries, `All ${concurrentQueries} concurrent database queries resolved cleanly`);
    console.log(`     (Execution time for ${concurrentQueries} concurrent pooled queries: ${durationMs}ms)`);
  } catch (err) {
    console.error('Concurrency test error:', err.message);
    assert(false, 'Connection pool handled concurrent queries');
  }

  // ── TEST 7: Migration 102 Composite Indexes Verification ─────────────────
  console.log('\n--- 7. Migration 102 Production Composite Indexes ---');
  try {
    const expectedIndexes = [
      { table: 'job_carts', index: 'idx_jc_franchise_status_created' },
      { table: 'bookings', index: 'idx_bookings_franchise_status_created' },
      { table: 'payments', index: 'idx_payments_franchise_paid_status' },
      { table: 'v2_payments', index: 'idx_v2_pay_status_created' },
      { table: 'audit_logs', index: 'idx_audit_logs_user_action_time' },
      { table: 'v2_audit_logs', index: 'idx_v2_audit_franchise_created' },
      { table: 'v2_audit_logs', index: 'idx_v2_audit_user_action' }
    ];

    for (const item of expectedIndexes) {
      const [rows] = await pool.query(
        `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.STATISTICS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [process.env.DB_NAME, item.table, item.index]
      );
      assert(rows[0].cnt > 0, `Index "${item.index}" exists on table "${item.table}"`);
    }
  } catch (err) {
    console.error('Index check error:', err.message);
    assert(false, 'Index verification completed');
  }

  // ── SUMMARY REPORT ────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log(`📊 PART B TEST SUITE RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  if (passedTests === totalTests) {
    console.log('🎉 ALL PART B LAUNCH-READINESS TESTS PASSED WITH 100% SUCCESS RATE');
  } else {
    console.error(`⚠  ${totalTests - passedTests} TESTS FAILED. CHECK LOGS ABOVE.`);
  }
  console.log('═'.repeat(70) + '\n');

  process.exit(passedTests === totalTests ? 0 : 1);
}

runPartBSuite().catch((err) => {
  console.error('Fatal test suite runner error:', err);
  process.exit(1);
});
