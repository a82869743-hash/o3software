const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BASE_URL = process.env.VITE_API_URL || 'http://localhost:5000/api';

async function testAll() {
  console.log('\n🚀 Running 100% Backend Endpoint Health Check...\n');

  // 1. Login
  let token;
  try {
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      mobile: '7225030303',
      password: 'admin123'
    });
    token = loginRes.data.data.token;
    console.log('  ✓ [POST /auth/login] SUCCESS (Admin Token Acquired)');
  } catch (e) {
    console.error('  ❌ [POST /auth/login] FAILED:', e.response?.data || e.message);
    process.exit(1);
  }

  const client = axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-franchise-id': '1'
    }
  });

  const endpoints = [
    { name: 'Auth GetMe', method: 'get', url: '/auth/me' },
    { name: 'Dashboard Stats', method: 'get', url: '/dashboard/stats' },
    { name: 'Job Cards List', method: 'get', url: '/job-carts' },
    { name: 'Customers List', method: 'get', url: '/customers' },
    { name: 'Inventory List', method: 'get', url: '/inventory' },
    { name: 'Services List', method: 'get', url: '/services' },
    { name: 'Vendors List', method: 'get', url: '/vendors' },
    { name: 'Inquiries List', method: 'get', url: '/inquiries' },
    { name: 'Inquiries Stats', method: 'get', url: '/inquiries/stats' },
    { name: 'Franchises List', method: 'get', url: '/franchises' },
    { name: 'Bookings List', method: 'get', url: '/bookings' },
    { name: 'User Packages List', method: 'get', url: '/user-packages' },
  ];

  let passed = 0;
  let failed = 0;

  for (const ep of endpoints) {
    try {
      const res = await client[ep.method](ep.url);
      if (res.status >= 200 && res.status < 300) {
        console.log(`  ✓ [${ep.name}] SUCCESS (${ep.url})`);
        passed++;
      } else {
        console.error(`  ❌ [${ep.name}] UNEXPECTED STATUS ${res.status}`);
        failed++;
      }
    } catch (err) {
      console.error(`  ❌ [${ep.name}] FAILED (${ep.url}):`, err.response?.data?.error || err.message);
      failed++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Summary: ${passed} Passed, ${failed} Failed out of ${endpoints.length} endpoints tested`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

testAll();
