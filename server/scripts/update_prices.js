/**
 * Update inventory prices for products with ₹0 selling_price
 * Prices based on Indian market research for car care/detailing products
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

const PRICE_MAP = {
  'Teflon Spray':      { selling: 799,  cost: 350,  mrp: 1299 },
  'Ceramic Pro 9H':    { selling: 4999, cost: 2200, mrp: 7999 },
  'PPF Film Roll':     { selling: 8999, cost: 4500, mrp: 14999 },
  'Dashboard Polish':  { selling: 349,  cost: 150,  mrp: 599 },
  'Glass Cleaner':     { selling: 299,  cost: 130,  mrp: 499 },
  'Microfiber Cloth':  { selling: 199,  cost: 80,   mrp: 349 },
  'Car Shampoo':       { selling: 449,  cost: 200,  mrp: 799 },
  'Wax Polish':        { selling: 599,  cost: 260,  mrp: 999 },
  'Tire Shine':        { selling: 399,  cost: 170,  mrp: 699 },
  'Interior Cleaner':  { selling: 449,  cost: 200,  mrp: 799 },
};

(async () => {
  try {
    console.log('Updating inventory prices...\n');

    for (const [name, prices] of Object.entries(PRICE_MAP)) {
      const [result] = await pool.query(
        'UPDATE inventory SET selling_price = ?, cost_price = ? WHERE product_name = ? AND selling_price = 0',
        [prices.selling, prices.cost, name]
      );
      console.log('  ' + name + ': ' + result.affectedRows + ' rows updated (₹' + prices.selling + ')');
    }

    console.log('\n✅ All prices updated!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
