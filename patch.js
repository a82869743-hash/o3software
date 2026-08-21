const fs = require('fs');
let content = fs.readFileSync('server/src/services/invoiceService.js', 'utf8');

content = content.replace(
  "${hasPackage ? 'Included' : formatINR(servicePrice)}",
  "${hasPackage ? 'Included' : `₹ ${formatINR(servicePrice)}`}"
);

content = content.replace(
  "${hasPackage ? '₹ 0.00' : formatINR(servicePrice)}",
  "${hasPackage ? '₹ 0.00' : `₹ ${formatINR(servicePrice)}`}"
);

fs.writeFileSync('server/src/services/invoiceService.js', content, 'utf8');
console.log('Successfully replaced formatINR in QuickWash PDF');
