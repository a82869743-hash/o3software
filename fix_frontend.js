const fs = require('fs');
const files = [
  'client/src/pages/admin/CustomerDetailPage.tsx',
  'client/src/pages/admin/CustomersListPage.tsx',
  'client/src/pages/admin/PackageApprovalsPage.tsx',
  'client/src/pages/customer/BuyPackagesPage.tsx'
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    let code = fs.readFileSync(f, 'utf8');
    code = code.replace(/\\`/g, '`');
    code = code.replace(/\\\$/g, '$');
    fs.writeFileSync(f, code);
    console.log('Fixed', f);
  }
});
