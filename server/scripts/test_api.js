const http = require('http');

function post(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: 'localhost',
      port: 5000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: 'localhost',
      port: 5000,
      path,
      method: 'GET',
      headers
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  try {
    // 1. Log in as customer
    const loginRes = await post('/api/auth/login', {
      mobile: '9000000002',
      password: 'test123'
    });
    console.log('Login Response Status:', loginRes.status);
    if (!loginRes.body.success) {
      console.log('Login failed:', loginRes.body);
      process.exit(1);
    }
    const token = loginRes.body.data.token;
    const authHeader = { 'Authorization': `Bearer ${token}` };

    // 2. Fetch customer products
    const invRes = await get('/api/products', authHeader);
    console.log('Products Response Status:', invRes.status);
    console.log('Products Response Body:', invRes.body);

    // 3. Fetch my orders
    const ordersRes = await get('/api/products/my-orders', authHeader);
    console.log('My Orders Response Status:', ordersRes.status);
    console.log('My Orders Response Body:', ordersRes.body);

  } catch (err) {
    console.error(err);
  }
}

run();
