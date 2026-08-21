const pool = require('./src/config/db');
const inventoryCtrl = require('./src/controllers/inventoryController');

async function testInventoryPricingRoles() {
  console.log('===========================================================');
  console.log('   TESTING INVENTORY PRICING RBAC & FRANCHISE OVERRIDES    ');
  console.log('===========================================================\n');

  try {
    const conn = await pool.getConnection();

    // 1. Create a test item with all 4 pricing tiers
    const [insRes] = await conn.query(
      `INSERT INTO inventory (product_name, unit, quantity, low_stock_threshold, cost_price, franchise_price, selling_price, staff_price, price_visible_to_staff, franchise_id)
       VALUES ('TEST RBAC ACCESSORY', 'pcs', 50, 5, 500.00, 750.00, 1200.00, 800.00, 1, 1)`
    );
    const testItemId = insRes.insertId;
    console.log(`✓ Created Test Item ID: ${testItemId}`);

    // Add a custom franchise price override for Franchise ID 2
    await conn.query(
      `INSERT INTO franchise_inventory_pricing (inventory_id, franchise_id, franchise_price)
       VALUES (?, 2, 700.00)
       ON DUPLICATE KEY UPDATE franchise_price = VALUES(franchise_price)`,
      [testItemId, 700.00]
    );
    console.log('✓ Added custom franchise price (₹700) for Franchise ID 2');

    // Helper mock helper for getOne
    const runGetOneForUser = async (userRole, franchiseHeaderId) => {
      let resultData = null;
      const req = {
        params: { id: testItemId },
        user: { role: userRole },
        headers: { 'x-franchise-id': String(franchiseHeaderId || 1) }
      };
      const res = {
        json: (payload) => { resultData = payload.data; },
        status: () => res
      };
      await inventoryCtrl.getOne(req, res);
      return resultData;
    };

    console.log('\n--- 1. ADMIN USER ACCESS ---');
    const adminData = await runGetOneForUser('admin', 1);
    console.log('  Cost Price      :', adminData.cost_price);
    console.log('  Franchise Price :', adminData.franchise_price);
    console.log('  Selling Price   :', adminData.selling_price);
    console.log('  Staff Price     :', adminData.staff_price);
    if (parseFloat(adminData.cost_price) === 500 && parseFloat(adminData.franchise_price) === 750 && parseFloat(adminData.selling_price) === 1200) {
      console.log('✓ Verified: Admin sees all 4 pricing tiers!');
    } else {
      console.error('❌ Admin pricing check failed');
    }

    console.log('\n--- 2. FRANCHISE USER ACCESS (Franchise 1 - Default Wholesale) ---');
    const f1Data = await runGetOneForUser('franchise', 1);
    console.log('  Cost Price      :', f1Data.cost_price, '(Must be undefined)');
    console.log('  Franchise Price :', f1Data.franchise_price);
    console.log('  Selling Price   :', f1Data.selling_price);
    if (f1Data.cost_price === undefined && parseFloat(f1Data.franchise_price) === 750) {
      console.log('✓ Verified: Cost price hidden, default franchise price returned!');
    } else {
      console.error('❌ Franchise 1 pricing check failed');
    }

    console.log('\n--- 3. FRANCHISE USER ACCESS (Franchise 2 - Custom Wholesale Override) ---');
    const f2Data = await runGetOneForUser('franchise', 2);
    console.log('  Cost Price      :', f2Data.cost_price, '(Must be undefined)');
    console.log('  Franchise Price :', f2Data.franchise_price, '(Custom Override)');
    console.log('  Selling Price   :', f2Data.selling_price);
    if (f2Data.cost_price === undefined && parseFloat(f2Data.franchise_price) === 700) {
      console.log('✓ Verified: Custom franchise wholesale price (₹700) returned!');
    } else {
      console.error('❌ Franchise 2 custom override check failed');
    }

    console.log('\n--- 4. STAFF USER ACCESS ---');
    const staffData = await runGetOneForUser('staff', 1);
    console.log('  Cost Price      :', staffData.cost_price, '(Must be undefined)');
    console.log('  Franchise Price :', staffData.franchise_price, '(Must be undefined)');
    console.log('  Staff Price     :', staffData.staff_price);
    console.log('  Selling Price   :', staffData.selling_price);
    if (staffData.cost_price === undefined && staffData.franchise_price === undefined) {
      console.log('✓ Verified: Cost price and franchise prices completely stripped from Staff payload!');
    } else {
      console.error('❌ Staff pricing check failed');
    }

    console.log('\n--- 5. CUSTOMER USER ACCESS ---');
    const customerData = await runGetOneForUser('customer', 1);
    console.log('  Cost Price      :', customerData.cost_price, '(Must be undefined)');
    console.log('  Franchise Price :', customerData.franchise_price, '(Must be undefined)');
    console.log('  Staff Price     :', customerData.staff_price, '(Must be undefined)');
    console.log('  Selling Price   :', customerData.selling_price);
    if (customerData.cost_price === undefined && customerData.franchise_price === undefined && customerData.staff_price === undefined && parseFloat(customerData.selling_price) === 1200) {
      console.log('✓ Verified: Customer only sees customer retail selling_price!');
    } else {
      console.error('❌ Customer pricing check failed');
    }

    // Cleanup test data
    await conn.query('DELETE FROM franchise_inventory_pricing WHERE inventory_id = ?', [testItemId]);
    await conn.query('DELETE FROM inventory WHERE id = ?', [testItemId]);
    console.log('\n✓ Cleaned up test item');

    conn.release();
    process.exit(0);
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  }
}

testInventoryPricingRoles();
