const pool = require('../src/config/db');

(async () => {
  try {
    const [tables] = await pool.query('SHOW TABLES');
    const tableNames = tables.map(r => Object.values(r)[0]);
    const hasFranchise = [];
    const noFranchise = [];
    for (const t of tableNames) {
      const [cols] = await pool.query(`DESCRIBE \`${t}\``);
      const colNames = cols.map(c => c.Field);
      if (colNames.includes('franchise_id')) {
        hasFranchise.push(t);
      } else {
        noFranchise.push(t);
      }
    }
    console.log('Tables WITH franchise_id (' + hasFranchise.length + '):');
    console.log(hasFranchise);
    console.log('\nRelevant Tables WITHOUT franchise_id:');
    const tenantRelated = [
      'users', 'job_carts', 'bookings', 'manual_bills', 'transactions',
      'inventory', 'slots', 'packages', 'settings', 'services', 'quotations',
      'leads', 'inquiries', 'feedback', 'expenses', 'staff_details'
    ];
    console.log(tenantRelated.filter(t => noFranchise.includes(t)));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
