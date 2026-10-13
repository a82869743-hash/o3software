/**
 * test_phase2_whatsapp_adapters.js — Comprehensive Test Suite for Phase 2
 * Verifies:
 * 1. Interface Contract conformance across all 4 adapters (mock, meta_cloud, aisensy, baileys_demo)
 * 2. Mock Adapter send & health check execution
 * 3. Baileys Demo Mode safeguards (Disabled-by-default, Whitelist blocking non-whitelisted numbers)
 * 4. Opt-Out ("STOP") enforcement & dispatch suppression
 * 5. 24-hour customer care window verification in Meta Cloud API
 * 6. Dynamic provider switching per franchise (zero code change)
 * 7. End-to-end notification queue idempotency (no duplicate sends)
 * 8. AES-256-GCM credential encryption/decryption integrity
 */

const pool = require('./src/config/db');
const { encrypt, decrypt } = require('./src/utils/cryptoUtil');
const whatsappManager = require('./src/services/whatsapp/WhatsAppManager');
const notificationQueue = require('./src/services/notificationQueue');
const IWhatsAppProvider = require('./src/services/whatsapp/IWhatsAppProvider');
const MockAdapter = require('./src/services/whatsapp/MockAdapter');
const MetaCloudAdapter = require('./src/services/whatsapp/MetaCloudAdapter');
const AiSensyAdapter = require('./src/services/whatsapp/AiSensyAdapter');
const BaileysDemoAdapter = require('./src/services/whatsapp/BaileysDemoAdapter');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failedTests++;
  }
}

async function runTestSuite() {
  console.log('\n================================================================');
  console.log('🧪 RUNNING PHASE 2 WHATSAPP ADAPTER & GOVERNANCE TEST SUITE');
  console.log('================================================================\n');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1: Adapter Contract Verification
  // ───────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Interface Contract Conformance ---');
  const adapters = [
    new MockAdapter(),
    new MetaCloudAdapter(),
    new AiSensyAdapter(),
    new BaileysDemoAdapter()
  ];

  for (const adapter of adapters) {
    const name = adapter.getProviderName();
    assert(adapter instanceof IWhatsAppProvider, `${name} extends IWhatsAppProvider`);
    assert(typeof adapter.sendTemplate === 'function', `${name} implements sendTemplate()`);
    assert(typeof adapter.sendFreeForm === 'function', `${name} implements sendFreeForm()`);
    assert(typeof adapter.sendMedia === 'function', `${name} implements sendMedia()`);
    assert(typeof adapter.healthCheck === 'function', `${name} implements healthCheck()`);
    assert(typeof adapter.handleWebhook === 'function', `${name} implements handleWebhook()`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2: AES-256-GCM Credential Encryption & Decryption
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: AES-256-GCM Credential Encryption ---');
  const secretKey = 'EAAG_meta_long_lived_token_1234567890_antigravity';
  const encrypted = encrypt(secretKey);
  assert(encrypted !== secretKey, 'Secret is transformed into encrypted ciphertext');
  assert(encrypted.includes(':'), 'Ciphertext contains IV:tag:data payload segments');
  const decrypted = decrypt(encrypted);
  assert(decrypted === secretKey, 'Decryption recovers exact original plaintext secret');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: Mock Adapter Functionality
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Mock Adapter Dispatch & Verification ---');
  const mock = new MockAdapter();
  const mockHealth = await mock.healthCheck();
  assert(mockHealth.status === 'ready', 'Mock adapter reports status "ready"');

  const mockTplRes = await mock.sendTemplate({
    to: '919876543210',
    templateName: 'BOOKING_CONFIRMED',
    components: ['Harshil', 'Ceramic Coating']
  });
  assert(mockTplRes.success === true, 'Mock adapter sendTemplate returns success=true');
  assert(mockTplRes.provider === 'mock', 'Mock adapter marks provider as "mock"');
  assert(mock.sentMessages.length >= 1, 'Mock adapter records message in sentMessages memory ledger');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4: Baileys Demo Mode Whitelist Safeguards
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Baileys Demo Mode Whitelist Safeguards ---');
  const baileys = new BaileysDemoAdapter();

  // Test 4A: Disabled when flag is false
  process.env.ENABLE_BAILEYS_DEMO = 'false';
  let disabledError = null;
  try {
    await baileys.sendFreeForm({ to: '919876543210', text: 'Hello' });
  } catch (err) {
    disabledError = err.message;
  }
  assert(
    disabledError && disabledError.includes('Baileys Demo Mode is disabled'),
    'Baileys blocks sends when ENABLE_BAILEYS_DEMO is false'
  );

  // Test 4B: Whitelist block when enabled
  process.env.ENABLE_BAILEYS_DEMO = 'true';
  process.env.DEMO_WHITELIST = '919999999999,918888888888';
  let whitelistError = null;
  try {
    await baileys.sendFreeForm({ to: '919111111111', text: 'Blocked message' });
  } catch (err) {
    whitelistError = err.message;
  }
  assert(
    whitelistError && whitelistError.includes('[DEMO MODE SAFEGUARD] Sending blocked to non-whitelisted number'),
    'Baileys blocks sends to non-whitelisted number (+919111111111)'
  );

  const isWhitelisted = await baileys.isPhoneWhitelisted('919999999999');
  assert(isWhitelisted === true, 'Whitelist accepts explicitly whitelisted number (+919999999999)');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 5: Opt-Out ("STOP") Enforcement
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: Opt-Out ("STOP") Enforcement ---');
  const optOutPhone = '919000000001';
  // Insert test opt-out into database
  await pool.query(
    'INSERT IGNORE INTO whatsapp_opt_outs (phone, reason, opt_out_date) VALUES (?, ?, NOW())',
    [optOutPhone, 'Customer texted STOP in test suite']
  );

  const isOpted = await whatsappManager.isOptedOut(optOutPhone);
  assert(isOpted === true, `isOptedOut returns true for registered opted-out number (+${optOutPhone})`);

  // Attempt send via WhatsAppManager
  const suppressedResult = await whatsappManager.sendTemplate({
    to: optOutPhone,
    templateName: 'BOOKING_CONFIRMED',
    franchiseId: 1
  });
  assert(suppressedResult.success === false, 'WhatsAppManager aborts send to opted-out recipient');
  assert(suppressedResult.opted_out === true, 'WhatsAppManager marks response with opted_out=true');
  assert(suppressedResult.error.includes('Customer has opted out'), 'Correct opt-out suppression reason returned');

  // Clean up test opt-out
  await pool.query('DELETE FROM whatsapp_opt_outs WHERE phone = ?', [optOutPhone]);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 6: Meta Cloud 24-Hour Care Window Logic
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 6: Meta Cloud 24-Hour Customer Care Window ---');
  const metaAdapter = new MetaCloudAdapter();

  // Test checking window for customer with no inbound history
  const testPhone = '919000000002';
  const hasWindow = await metaAdapter.isWindowActive(testPhone, 1);
  assert(hasWindow === false, 'isWindowActive returns false when no inbound customer chat exists');

  let windowError = null;
  try {
    await metaAdapter.sendFreeForm({ to: testPhone, text: 'Promotional message without template', franchiseId: 1 });
  } catch (err) {
    windowError = err.message;
  }
  assert(
    windowError && windowError.includes('Customer service window is closed'),
    'Meta Cloud Adapter blocks free-form text when 24h care window is closed, requiring approved template'
  );

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 7: Dynamic Provider Switching Per Franchise
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 7: Dynamic Provider Switching ---');
  // Switch Franchise 1 to 'mock'
  await whatsappManager.setFranchiseProvider(1, {
    provider: 'mock',
    isEnabled: 1
  });

  const resolvedAdapter = await whatsappManager.getAdapter(1);
  assert(resolvedAdapter.getProviderName() === 'mock', 'WhatsAppManager dynamically resolves mock provider for Franchise 1');

  const dispatchResult = await whatsappManager.sendTemplate({
    to: '919876543210',
    templateName: 'WARRANTY_CERTIFICATE',
    franchiseId: 1
  });
  assert(dispatchResult.success === true, 'Template send through switched mock provider succeeds');
  assert(dispatchResult.provider === 'mock', 'Message dispatched through active mock provider');

  // Switch Franchise 1 back to 'meta_cloud'
  await whatsappManager.setFranchiseProvider(1, {
    provider: 'meta_cloud',
    isEnabled: 1
  });
  const revertedAdapter = await whatsappManager.getAdapter(1);
  assert(revertedAdapter.getProviderName() === 'meta_cloud', 'WhatsAppManager dynamically re-pointed back to meta_cloud');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 8: Notification Queue Strict Idempotency
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 8: Notification Queue Strict Idempotency ---');
  const testIdempotencyKey = `idemp_test_${Date.now()}_phase2`;

  const enqueue1 = await notificationQueue.enqueueNotification({
    idempotency_key: testIdempotencyKey,
    channel: 'whatsapp',
    mobile: '9876543210',
    template_name: 'INVOICE_BILL',
    message_body: 'Tax invoice test notification',
    franchise_id: 1
  });
  assert(enqueue1.success === true, 'First notification enqueue succeeds');
  assert(!enqueue1.deduplicated, 'First notification is not flagged as deduplicated');

  const enqueue2 = await notificationQueue.enqueueNotification({
    idempotency_key: testIdempotencyKey,
    channel: 'whatsapp',
    mobile: '9876543210',
    template_name: 'INVOICE_BILL',
    message_body: 'Duplicate tax invoice test notification',
    franchise_id: 1
  });
  assert(enqueue2.success === true, 'Second notification enqueue returns success without error');
  assert(enqueue2.deduplicated === true, 'Second notification is strictly deduplicated via idempotency key');
  assert(enqueue2.notificationId === enqueue1.notificationId, 'Both calls resolve to the identical notification ID');

  // Clean up test log
  await pool.query('DELETE FROM v2_notification_logs WHERE idempotency_key = ?', [testIdempotencyKey]);

  // ───────────────────────────────────────────────────────────────────────────
  // FINAL REPORT
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`🏁 TEST SUITE COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
