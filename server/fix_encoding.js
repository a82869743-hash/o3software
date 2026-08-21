const fs = require('fs');
const file = 'src/services/invoiceService.js';
let content = fs.readFileSync(file, 'utf8');

// The problematic string is a specific byte sequence decoded as utf8
// I'll replace any remaining 'â€”' characters
// Let's replace by buffer replace to be sure or just string
content = content.replace(/â€”/g, '-');
content = content.replace(/â‚¹/g, '₹');
content = content.replace(/â•/g, '-'); // ASCII box drawing artifacts

fs.writeFileSync(file, content);
