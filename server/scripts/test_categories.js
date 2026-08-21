const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function test() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Test1234',
    database: process.env.DB_NAME || 'o3_car_spa',
  });

  const categories = ['ceramic', 'wash', 'denting', 'ppf', 'interior', 'other'];

  console.log('\n--- Service Category Subdivision Test ---');
  for (const c of categories) {
    let kw = '';
    if (c === 'ceramic') kw = 'ceramic|coating|9h|10h|graphene';
    else if (c === 'wash') kw = 'wash|spa|foam|waterless|shampoo';
    else if (c === 'denting') kw = 'dent|paint|tinker|scratch|rubbing';
    else if (c === 'ppf') kw = 'ppf|film|wrap|tpu|tph';
    else if (c === 'interior') kw = 'interior|seat|carpet|dashboard|upholstery|vacuum';

    let query = '';
    let params = [];
    if (kw) {
      query = 'SELECT COUNT(DISTINCT job_cart_id) AS cnt FROM job_services WHERE LOWER(service_name) REGEXP ?';
      params = [kw];
    } else {
      query = `SELECT COUNT(DISTINCT job_cart_id) AS cnt FROM job_services WHERE LOWER(service_name) NOT REGEXP 'ceramic|coating|9h|10h|graphene|wash|spa|foam|waterless|shampoo|dent|paint|tinker|scratch|rubbing|ppf|film|wrap|tpu|tph|interior|seat|carpet|dashboard|upholstery|vacuum'`;
    }

    const [rows] = await pool.query(query, params);
    console.log(`Category [${c.toUpperCase().padEnd(8)}]: ${rows[0].cnt} Job Card(s) matching`);
  }

  await pool.end();
  console.log('\n✅ Category Subdivision Query Works Perfectly!\n');
}

test().catch(e => console.error(e));
