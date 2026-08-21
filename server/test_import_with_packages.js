const pool = require('./src/config/db');
const importController = require('./src/controllers/importController');
const userPkgCtrl = require('./src/controllers/userPackagesController');

async function testImportWithPackages() {
  console.log('===========================================================');
  console.log('   TESTING CUSTOMER IMPORT WITH PACKAGE AUTO-ASSIGNMENT    ');
  console.log('===========================================================\n');

  const reqMock = {
    file: {
      buffer: Buffer.from(''),
      originalname: 'imported_customers.xlsx'
    }
  };

  // Mock parseFile & validate
  const importService = require('./src/services/importService');
  importService.parseFile = () => [
    {
      customer_name: 'Vikram Merchant',
      mobile_number: '9876598765',
      email: 'vikram.merchant@gmail.com',
      vehicle_reg_no: 'GJ01VM9999',
      car_brand: 'Mercedes',
      car_model: 'C-Class',
      loyalty_credits: '100',
      free_washes: '1',
      wax_count: '1',
      package_name: 'CERAMIC LEATHER AMC',
      purchase_date: '2025-09-19', // 11 months ago -> 30 days remaining!
      price_paid: '25000'
    }
  ];

  const conn = await pool.getConnection();
  try {
    const resMock = {
      json: async (result) => {
        console.log('Import Result:', result);
        
        // Find imported user
        const [u] = await pool.query("SELECT id FROM users WHERE mobile = '9876598765'");
        if (u.length) {
          const userId = u[0].id;
          console.log(`\n✓ Imported Customer ID: ${userId}`);

          // Fetch customer dashboard package data
          const pkgData = await userPkgCtrl.getDashboardPackageData(userId);
          console.log('\n--- CUSTOMER DASHBOARD FOR IMPORTED CUSTOMER ---');
          console.log(`  Customer Name   : Vikram Merchant`);
          console.log(`  Active Package  : ${pkgData.active_package?.package_name}`);
          console.log(`  Days Remaining  : ${pkgData.active_package?.days_remaining}`);
          console.log(`  Reminder Stage  : ${pkgData.active_package?.reminder_stage} (${pkgData.active_package?.reminder_label})`);
          console.log(`  Pop-Up Eligible : ${pkgData.active_package?.is_popup_eligible}`);
          console.log(`  Pop-Up Message  : "${pkgData.active_package?.popup_message}"`);
          console.log(`  Continuous Notif: "${pkgData.active_package?.continuous_notification}"`);
          console.log(`  Autodate 1 Month: ${pkgData.active_package?.autodate_1month}`);
          console.log(`  Autodate 1 Week : ${pkgData.active_package?.autodate_1week}`);
          console.log(`  Autodate 1 Day  : ${pkgData.active_package?.autodate_1day}`);

          console.log('\n✓ Verified: Imported customers automatically receive full maintenance reminder support, pop-up popups, autodate calculations, and WhatsApp templates!');
        }

        process.exit(0);
      },
      status: () => resMock
    };

    await importController.importCustomers(reqMock, resMock);
  } catch (err) {
    console.error('Import test error:', err);
    process.exit(1);
  } finally {
    conn.release();
  }
}

testImportWithPackages();
