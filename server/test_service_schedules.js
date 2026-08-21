const pool = require('./src/config/db');
const userPkgCtrl = require('./src/controllers/userPackagesController');

async function testServiceSchedules() {
  console.log('===========================================================');
  console.log('   TESTING SERVICE-WISE SCHEDULED DATES IN PACKAGES        ');
  console.log('===========================================================\n');

  try {
    // Fetch active package data for customer 2 (Bablu Kumar)
    const data = await userPkgCtrl.getDashboardPackageData(2);
    console.log('Active Package:', data.active_package?.package_name);
    console.log('Days Remaining:', data.active_package?.days_remaining);
    
    console.log('\n--- SERVICE-WISE SCHEDULED DATES BREAKDOWN ---');
    if (data.active_package?.service_schedules) {
      data.active_package.service_schedules.forEach((s, idx) => {
        console.log(`  [Instance #${s.instance_number}] ${s.service_name}`);
        console.log(`    Scheduled Date : ${s.scheduled_date_formatted} (${s.scheduled_date})`);
        console.log(`    1-Month Reminder: ${s.reminder_1m_formatted} (${s.reminder_date_1m})`);
        console.log(`    Status          : ${s.status}`);
        console.log('-----------------------------------------------------------');
      });
    } else {
      console.log('No service schedules found!');
    }

    process.exit(0);
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  }
}

testServiceSchedules();
