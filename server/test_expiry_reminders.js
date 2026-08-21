const pool = require('./src/config/db');
const userPkgCtrl = require('./src/controllers/userPackagesController');

async function testExpiryReminders() {
  console.log('===========================================================');
  console.log('   PACKAGE MAINTENANCE REMINDERS & AUTODATES VERIFICATION  ');
  console.log('===========================================================\n');

  const reqMock = {};
  const resMockAlerts = {
    json: (data) => {
      console.log('--- 1. ADMIN EXPIRY ALERTS ENDPOINT (/api/v1/user-packages/expiry-alerts) ---');
      console.log(`Total Expiring Packages Found: ${data.data.length}\n`);
      
      data.data.forEach((item, i) => {
        console.log(`[Package #${i+1}]`);
        console.log(`  Customer Name   : ${item.customer_name} (${item.customer_mobile})`);
        console.log(`  Package Name    : ${item.package_name}`);
        console.log(`  Vehicle Reg     : ${item.registration_no || 'N/A'} (${item.brand || ''} ${item.model || ''})`);
        console.log(`  Expiry Date     : ${new Date(item.end_date).toLocaleDateString('en-IN')}`);
        console.log(`  Days Remaining  : ${item.days_remaining} day(s)`);
        console.log(`  Reminder Stage  : ${item.reminder_stage} (${item.reminder_label})`);
        console.log(`  Pop-Up Eligible : ${item.is_popup_eligible}`);
        console.log(`  Continuous Notif: "${item.continuous_notification}"`);
        console.log(`  Autodates       : 1 Month (${item.autodate_1month}) | 1 Week (${item.autodate_1week}) | 1 Day (${item.autodate_1day})`);
        console.log(`  WhatsApp Msg    : \n    ${item.whatsapp_message.replace(/\n/g, '\n    ')}`);
        console.log('-----------------------------------------------------------');
      });
    },
    status: () => resMockAlerts
  };

  await userPkgCtrl.getExpiryAlerts(reqMock, resMockAlerts);

  console.log('\n--- 2. CUSTOMER DASHBOARD PACKAGE DATA (User ID 2: Bablu Kumar) ---');
  const cust2Data = await userPkgCtrl.getDashboardPackageData(2);
  const pkg2 = cust2Data.active_package;
  if (pkg2) {
    console.log(`  Customer        : Bablu Kumar`);
    console.log(`  Active Package  : ${pkg2.package_name}`);
    console.log(`  Days Remaining  : ${pkg2.days_remaining}`);
    console.log(`  Reminder Stage  : ${pkg2.reminder_stage} (${pkg2.reminder_label})`);
    console.log(`  Pop-Up Eligible : ${pkg2.is_popup_eligible}`);
    console.log(`  Pop-Up Message  : "${pkg2.popup_message}"`);
    console.log(`  Continuous Notif: "${pkg2.continuous_notification}"`);
    console.log(`  Autodates       : 1M (${pkg2.autodate_1month}) | 1W (${pkg2.autodate_1week}) | 1D (${pkg2.autodate_1day})`);
  }

  console.log('\n--- 3. CUSTOMER DASHBOARD PACKAGE DATA (User ID 12: Ananya Verma - 1 Day Tier) ---');
  const cust12Data = await userPkgCtrl.getDashboardPackageData(12);
  const pkg12 = cust12Data.active_package;
  if (pkg12) {
    console.log(`  Customer        : Ananya Verma`);
    console.log(`  Active Package  : ${pkg12.package_name}`);
    console.log(`  Days Remaining  : ${pkg12.days_remaining}`);
    console.log(`  Reminder Stage  : ${pkg12.reminder_stage} (${pkg12.reminder_label})`);
    console.log(`  Pop-Up Eligible : ${pkg12.is_popup_eligible}`);
    console.log(`  Pop-Up Message  : "${pkg12.popup_message}"`);
    console.log(`  Continuous Notif: "${pkg12.continuous_notification}"`);
  }

  console.log('\n--- 4. CUSTOMER DASHBOARD PACKAGE DATA (User ID 5: Expired Customer - Continuous Notif Only) ---');
  const cust5Data = await userPkgCtrl.getDashboardPackageData(5);
  const pkg5 = cust5Data.active_package;
  if (!pkg5) {
    console.log(`  Active Package  : None (Expired)`);
    console.log(`  Result          : No pop-up active. Continuous warning notice displayed in dashboard.`);
  }

  process.exit(0);
}

testExpiryReminders();
