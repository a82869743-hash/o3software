const axios = require('axios');

async function testLiveAPIs() {
  try {
    // 1. Login as Admin
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      mobile: '7225030303',
      password: '12345'
    });

    const token = loginRes.data.data.token;
    console.log('✓ Admin login successful! Token acquired.');
    const headers = { Authorization: `Bearer ${token}` };

    // 2. Test Pending Payments
    const pendingRes = await axios.get('http://localhost:5000/api/payments/pending-reminders', { headers });
    console.log('✓ /api/payments/pending-reminders status:', pendingRes.status, '| Data count:', pendingRes.data.data.length);

    // 3. Test Roles & RBAC
    const rolesRes = await axios.get('http://localhost:5000/api/v2/roles', { headers });
    const rolesList = rolesRes.data.data || rolesRes.data || [];
    console.log('✓ /api/v2/roles status:', rolesRes.status, '| Roles count:', rolesList.length);

    // 4. Test Audit Logs
    const auditRes = await axios.get('http://localhost:5000/api/audit-logs', { headers });
    const auditLogs = auditRes.data.data || [];
    console.log('✓ /api/audit-logs status:', auditRes.status, '| Audit log count:', auditLogs.length);

    // 5. Test Live Search Vehicles
    const searchRes = await axios.get('http://localhost:5000/api/search/vehicles?q=GJ', { headers });
    const vehiclesList = searchRes.data.data || [];
    console.log('✓ /api/search/vehicles status:', searchRes.status, '| Results:', vehiclesList.length);

    console.log('\n================================================================');
    console.log('  ALL LIVE ENDPOINTS (PENDING PAYMENTS, RBAC, AUDIT LOGS, SEARCH)');
    console.log('  TESTED LIVE ON PORT 5000 — 100% SUCCESSFUL (200 OK)!');
    console.log('================================================================\n');
  } catch (err) {
    console.error('✗ Live API test failed:', err.response?.data || err.message);
  }
}

testLiveAPIs();
