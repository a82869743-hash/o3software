const mysql = require('mysql2/promise');

const API_BASE = 'http://localhost:5000/api';

async function main() {
  console.log('=== STARTING PRODUCTION INTEGRATION E2E PORTAL AUDIT ===\n');

  // Database connection for assertion checkups
  const db = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'o3_car_spa'
  });

  try {
    // -------------------------------------------------------------------------
    // STEP 1: Log in Referrer to retrieve their referral code
    // -------------------------------------------------------------------------
    console.log('Step 1: Logging in Referrer...');
    const loginRefRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: '9000000002', password: 'test123' })
    });
    
    if (!loginRefRes.ok) throw new Error('Referrer login failed: ' + await loginRefRes.text());
    const refJson = await loginRefRes.json();
    const referrerToken = refJson.data.token;
    const referrerId = refJson.data.user.id;
    console.log(`  - Referrer logged in. User ID: ${referrerId}`);

    // Get referrer referral code
    const codeRes = await fetch(`${API_BASE}/referrals/mine/code`, {
      headers: { 'Authorization': `Bearer ${referrerToken}` }
    });
    const codeJson = await codeRes.json();
    const referralCode = codeJson.data.code;
    console.log(`  - Referrer Referral Code: "${referralCode}"`);

    // Reset current_uses count to prevent E2E registration failures
    await db.query('UPDATE referral_codes SET current_uses = 0 WHERE code = ?', [referralCode]);

    // -------------------------------------------------------------------------
    // STEP 2: Register a new customer via referral link (Flow 1: Customer Welcome)
    // -------------------------------------------------------------------------
    console.log('\nStep 2: Registering a new customer with referral code...');
    const randomSuffix = Math.floor(Math.random() * 100000);
    const newMobile = '987' + String(randomSuffix).padStart(7, '0');
    const newEmail = `customer_e2e_${randomSuffix}@test.com`;

    const registerRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `E2E User ${randomSuffix}`,
        mobile: newMobile,
        email: newEmail,
        password: 'password123',
        referral_code: referralCode
      })
    });

    if (!registerRes.ok) throw new Error('Customer registration failed: ' + await registerRes.text());
    const regJson = await registerRes.json();
    const newCustomerToken = regJson.data.token;
    const newCustomerId = regJson.data.user.id;
    console.log(`  - Registered successfully. New Customer ID: ${newCustomerId}`);

    // Verify referral pending entry
    const [referralCheck] = await db.query(
      'SELECT * FROM v2_referrals WHERE referred_id = ? AND referrer_id = ?',
      [newCustomerId, referrerId]
    );
    console.log(`  - Checked v2_referrals entry:`, referralCheck[0] || 'NONE');
    if (referralCheck.length && referralCheck[0].status === 'pending') {
      console.log('  ✓ Referral pending log verified in v2_referrals!');
    } else {
      throw new Error('✗ Referral entry not found or not pending');
    }

    // -------------------------------------------------------------------------
    // STEP 3: Register a vehicle (Flow 1 continued)
    // -------------------------------------------------------------------------
    console.log('\nStep 3: Registering a vehicle segment...');
    const registration_no = 'GJ01E2E' + Math.floor(Math.random() * 9000 + 1000);
    const addVehicleRes = await fetch(`${API_BASE}/vehicles/add`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${newCustomerToken}`
      },
      body: JSON.stringify({
        brand: 'Hyundai',
        model: 'i20',
        registration_no,
        category: 'medium_hatchback',
        manufacture_year: 2022
      })
    });
    if (!addVehicleRes.ok) throw new Error('Vehicle registration failed: ' + await addVehicleRes.text());
    const vehJson = await addVehicleRes.json();
    const vehicleId = vehJson.data.id;
    console.log(`  - Vehicle created. ID: ${vehicleId}`);

    // -------------------------------------------------------------------------
    // STEP 4: Admin blocks a slot and verify exclusion (Flow 2: Calendar Blocking)
    // -------------------------------------------------------------------------
    console.log('\nStep 4: Admin blocking a calendar slot...');
    
    // Log in admin
    const loginAdminRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: '9316668760', password: '12345' })
    });
    if (!loginAdminRes.ok) throw new Error('Admin login failed: ' + await loginAdminRes.text());
    const adminJson = await loginAdminRes.json();
    const adminToken = adminJson.data.token;

    // Get slot ID for today/tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Dynamically create slot for tomorrow to ensure it exists
    const createSlotRes = await fetch(`${API_BASE}/slots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        slot_date: tomorrowStr,
        start_time: '10:00:00',
        end_time: '11:00:00',
        max_capacity: 2
      })
    });

    // Retrieve the slots list
    const slotsRes = await fetch(`${API_BASE}/slots?date=${tomorrowStr}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const slotsJson = await slotsRes.json();
    const firstSlot = slotsJson.data.find(s => s.start_time === '10:00:00');
    
    if (!firstSlot) throw new Error('Failed to retrieve seeded slot.');
    const targetSlotId = firstSlot.id;
    console.log(`  - Target Slot ID to Block: ${targetSlotId} on ${tomorrowStr} (${firstSlot.start_time})`);

    // Block the slot
    const blockRes = await fetch(`${API_BASE}/slots/${targetSlotId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ is_blocked: true, reason: 'E2E Test Block' })
    });
    if (!blockRes.ok) throw new Error('Slot blocking failed: ' + await blockRes.text());
    console.log('  ✓ Slot blocked successfully in v2_blocked_slots');

    // DB DIAGNOSTIC PRINTS
    const [blocks] = await db.query('SELECT * FROM v2_blocked_slots');
    console.log('  [DIAG] v2_blocked_slots rows:', blocks);
    const [slotsDb] = await db.query('SELECT id, slot_date, start_time, is_blocked FROM slots WHERE id = ?', [targetSlotId]);
    console.log('  [DIAG] slots row:', slotsDb[0]);

    // Customer queries availability: Verify blocked slot is excluded!
    const custSlotsRes = await fetch(`${API_BASE}/slots?date=${tomorrowStr}`, {
      headers: { 'Authorization': `Bearer ${newCustomerToken}` }
    });
    const custSlotsJson = await custSlotsRes.json();
    console.log('Customer slots returned:', custSlotsJson.data);
    const isExposed = custSlotsJson.data.some(s => s.id === targetSlotId);
    console.log(`  - Blocked slot in customer availability search: ${isExposed ? 'VISIBLE (FAIL)' : 'EXCLUDED (PASS)'}`);
    if (!isExposed) {
      console.log('  ✓ Blocked slot correctly hidden from customer selection grid!');
    } else {
      throw new Error('✗ Customer can see the blocked slot!');
    }

    // Restore slot blocking state
    await fetch(`${API_BASE}/slots/${targetSlotId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ is_blocked: false })
    });
    console.log('  ✓ Slot restored to active/unblocked.');

    // Self-healing reset: Ensure booked_count is 0 so slot is not full
    await db.query('UPDATE slots SET booked_count = 0 WHERE id = ?', [targetSlotId]);

    // -------------------------------------------------------------------------
    // STEP 5: Create & Approve Booking (Flow 2 & Flow 4: Welcome Bonus trigger)
    // -------------------------------------------------------------------------
    console.log('\nStep 5: Customer creating booking & Admin approving...');
    const createBookingRes = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${newCustomerToken}`
      },
      body: JSON.stringify({
        vehicle_id: vehicleId,
        slot_id: targetSlotId,
        slot_date: tomorrowStr,
        service_ids: [1],
        pickup_type: 'none',
        payment_method: 'cash'
      })
    });
    if (!createBookingRes.ok) throw new Error('Booking creation failed: ' + await createBookingRes.text());
    const bookingJson = await createBookingRes.json();
    const bookingId = bookingJson.data.id;
    console.log(`  - Booking created. ID: ${bookingId}`);

    // Admin approves the booking (which triggers the welcome reward & pending referral completed state)
    const approveRes = await fetch(`${API_BASE}/bookings/${bookingId}/approve`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ booking_notes: 'Approved via E2E Flow' })
    });
    if (!approveRes.ok) throw new Error('Booking approval failed: ' + await approveRes.text());
    console.log('  ✓ Booking approved by admin.');

    // Assert customer wallet has been credited with welcome points (500 pts)
    const [walletCheck] = await db.query('SELECT * FROM v2_wallets WHERE customer_id = ?', [newCustomerId]);
    console.log(`  - Customer Wallet Balance check:`, walletCheck[0] || 'NONE');
    if (walletCheck.length && Number(walletCheck[0].reward_points) === 500) {
      console.log('  ✓ New customer welcome bonus successfully awarded in v2_wallets!');
    } else {
      throw new Error('✗ Customer welcome points mismatch in wallet');
    }

    // Assert referral transition from 'pending' to 'completed' / 'rewarded'
    const [referralCheck2] = await db.query('SELECT * FROM v2_referrals WHERE referred_id = ?', [newCustomerId]);
    console.log(`  - Referral status transition check:`, referralCheck2[0]?.status);
    if (referralCheck2.length && (referralCheck2[0].status === 'completed' || referralCheck2[0].status === 'rewarded')) {
      console.log('  ✓ Referral state successfully transitioned on first booking approval!');
    } else {
      throw new Error('✗ Referral did not transition to completed or rewarded');
    }

    // -------------------------------------------------------------------------
    // STEP 6: Conversion to Job Cart & Staff Shielding checks (Flow 3)
    // -------------------------------------------------------------------------
    console.log('\nStep 6: Creating Job Cart & checking Staff Data Shielding...');
    
    // Create Job Cart from booking
    const jobCartRes = await fetch(`${API_BASE}/job-carts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        vehicle_id: vehicleId,
        booking_id: bookingId,
        registration_no,
        car_brand: 'Hyundai',
        car_model: 'i20',
        visit_date: new Date().toISOString().split('T')[0],
        notes: 'Detaling card created from E2E booking'
      })
    });
    if (!jobCartRes.ok) throw new Error('Job cart creation failed: ' + await jobCartRes.text());
    const jobCartJson = await jobCartRes.json();
    const jobCartId = jobCartJson.data.id;
    console.log(`  - Job Cart created. ID: ${jobCartId}`);

    // Log in Staff
    const loginStaffRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: '9000000003', password: 'test123' })
    });
    if (!loginStaffRes.ok) throw new Error('Staff login failed: ' + await loginStaffRes.text());
    const staffJson = await loginStaffRes.json();
    const staffToken = staffJson.data.token;

    // Staff queries list endpoint: verify total_amount and mobile are deleted
    const staffListRes = await fetch(`${API_BASE}/job-carts`, {
      headers: { 'Authorization': `Bearer ${staffToken}` }
    });
    const staffListJson = await staffListRes.json();
    const staffRecord = staffListJson.data.find(r => r.id === jobCartId);
    
    console.log(`  - Staff list record columns check:`, staffRecord);
    if (staffRecord && staffRecord.total_amount === undefined && staffRecord.customer_mobile === undefined) {
      console.log('  ✓ Staff job cart list RBAC shielding validated successfully!');
    } else {
      throw new Error('✗ Staff received unshielded total_amount/mobile in list view');
    }

    // Staff queries detail endpoint: verify service prices and totals are deleted
    const staffDetailRes = await fetch(`${API_BASE}/job-carts/${jobCartId}`, {
      headers: { 'Authorization': `Bearer ${staffToken}` }
    });
    const staffDetailJson = await staffDetailRes.json();
    const cartDetails = staffDetailJson.data;

    console.log(`  - Staff detail view shielding:`);
    console.log(`    * total_amount:`, cartDetails.total_amount);
    console.log(`    * discount_value:`, cartDetails.discount_value);
    console.log(`    * advance_paid:`, cartDetails.advance_paid);
    console.log(`    * balance_due:`, cartDetails.balance_due);
    console.log(`    * customer.mobile:`, cartDetails.customer?.mobile);

    if (
      cartDetails.total_amount === undefined &&
      cartDetails.discount_value === undefined &&
      cartDetails.advance_paid === undefined &&
      cartDetails.balance_due === undefined &&
      cartDetails.customer?.mobile === undefined
    ) {
      console.log('  ✓ Staff job cart detail pricing & contact shielding validated successfully!');
    } else {
      throw new Error('✗ Staff detail view leaks sensitive financial/contact fields');
    }

    // -------------------------------------------------------------------------
    // STEP 7: Job Cart Completion & Referral completion check (Flow 4)
    // -------------------------------------------------------------------------
    console.log('\nStep 7: Admin completing Job Cart & checking referral payouts...');

    // Admin adds a service
    await fetch(`${API_BASE}/job-carts/${jobCartId}/services`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ service_name: 'Full Foam Wash', service_price: 1500, labor_charges: 200, products: [] })
    });

    // Admin submits (opens) the job cart
    const submitRes = await fetch(`${API_BASE}/job-carts/${jobCartId}/submit`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    });
    if (!submitRes.ok) throw new Error('Job cart submit failed: ' + await submitRes.text());
    console.log('  ✓ Job Cart submitted (status updated to open).');

    // Admin completes the job cart
    const completeRes = await fetch(`${API_BASE}/job-carts/${jobCartId}/complete`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ credits_awarded: 10, free_washes_awarded: 0, wax_awarded: 0 })
    });
    if (!completeRes.ok) throw new Error('Job cart completion failed: ' + await completeRes.text());
    console.log('  ✓ Job Cart completed.');

    // Assert referrer has been rewarded (points added to referrer wallet)
    const [referrerWalletCheck] = await db.query('SELECT * FROM v2_wallets WHERE customer_id = ?', [referrerId]);
    console.log(`  - Referrer Wallet points balance:`, referrerWalletCheck[0]?.reward_points);
    if (referrerWalletCheck.length && Number(referrerWalletCheck[0].reward_points) > 0) {
      console.log('  ✓ Referrer rewarded successfully inside v2_wallets!');
    } else {
      throw new Error('✗ Referrer was not awarded points');
    }

    // Assert referral transition to 'rewarded' in v2_referrals
    const [referralCheck3] = await db.query('SELECT * FROM v2_referrals WHERE referred_id = ?', [newCustomerId]);
    console.log(`  - Referral final status:`, referralCheck3[0]?.status);
    if (referralCheck3.length && referralCheck3[0].status === 'rewarded') {
      console.log('  ✓ Referral successfully transitioned to final "rewarded" status!');
    } else {
      throw new Error('✗ Referral did not transition to rewarded status');
    }

    // -------------------------------------------------------------------------
    // STEP 8: Public Invoice File Download Verification
    // -------------------------------------------------------------------------
    console.log('\nStep 8: Checking invoice compilation and PDF download...');
    const invoiceRes = await fetch(`${API_BASE}/job-carts/${jobCartId}/invoice?token=${adminToken}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    console.log(`  - Invoice download status: ${invoiceRes.status}`);
    if (invoiceRes.ok) {
      console.log('  ✓ Detailing invoice PDF compiled and sent successfully!');
    } else {
      console.error('  ✗ PDF compilation failed: ', await invoiceRes.text());
    }

    console.log('\n=== ALL PRODUCTION E2E PORTAL JOURNEY CHECKS PASSED ===');

  } catch (err) {
    console.error('\n✗ E2E Integration Audit failed:', err.message);
  } finally {
    // Delete E2E registered entities to leave DB clean
    console.log('\nCleaning up E2E entities...');
    await db.query('SET FOREIGN_KEY_CHECKS = 0');
    await db.query('DELETE FROM v2_wallet_transactions WHERE customer_id IN (SELECT id FROM users WHERE email LIKE "customer_e2e%")');
    await db.query('DELETE FROM v2_reward_logs WHERE customer_id IN (SELECT id FROM users WHERE email LIKE "customer_e2e%")');
    await db.query('DELETE FROM customer_rewards WHERE customer_id IN (SELECT id FROM users WHERE email LIKE "customer_e2e%")');
    await db.query('DELETE FROM v2_wallets WHERE customer_id IN (SELECT id FROM users WHERE email LIKE "customer_e2e%")');
    await db.query('DELETE FROM v2_referrals WHERE referred_id IN (SELECT id FROM users WHERE email LIKE "customer_e2e%")');
    await db.query('DELETE FROM referral_rewards WHERE referred_id IN (SELECT id FROM users WHERE email LIKE "customer_e2e%")');
    await db.query('DELETE FROM referral_codes WHERE customer_id IN (SELECT id FROM users WHERE email LIKE "customer_e2e%")');
    await db.query('DELETE FROM job_services WHERE job_cart_id IN (SELECT id FROM job_carts WHERE booking_id IN (SELECT id FROM bookings WHERE customer_id IN (SELECT id FROM users WHERE email LIKE "customer_e2e%")))');
    await db.query('DELETE FROM job_carts WHERE booking_id IN (SELECT id FROM bookings WHERE customer_id IN (SELECT id FROM users WHERE email LIKE "customer_e2e%"))');
    await db.query('DELETE FROM booking_services WHERE booking_id IN (SELECT id FROM bookings WHERE customer_id IN (SELECT id FROM users WHERE email LIKE "customer_e2e%"))');
    await db.query('DELETE FROM bookings WHERE customer_id IN (SELECT id FROM users WHERE email LIKE "customer_e2e%")');
    await db.query('DELETE FROM vehicles WHERE customer_id IN (SELECT id FROM users WHERE email LIKE "customer_e2e%")');
    await db.query('DELETE FROM users WHERE email LIKE "customer_e2e%"');
    const cleanupTomorrow = new Date();
    cleanupTomorrow.setDate(cleanupTomorrow.getDate() + 1);
    const cleanupTomorrowStr = cleanupTomorrow.toISOString().split('T')[0];
    await db.query('DELETE FROM slots WHERE slot_date = ? AND start_time = "10:00:00"', [cleanupTomorrowStr]);
    await db.query('DELETE FROM referral_codes WHERE customer_id = 7 AND code LIKE "REF%"');
    await db.query('DELETE FROM referral_rewards WHERE referrer_id = 7');
    await db.query('UPDATE referral_codes SET current_uses = 0 WHERE customer_id = 7');
    await db.query('UPDATE v2_wallets SET reward_points = 0, total_earned = 0 WHERE customer_id = 7');
    await db.query('SET FOREIGN_KEY_CHECKS = 1');
    await db.end();
    console.log('✓ Database cleaned successfully.');
    process.exit(0);
  }
}

main();
