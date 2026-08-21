const fs = require('fs');
let code = fs.readFileSync('server/src/controllers/packagesController.js', 'utf8');
code = code.replace(/\\`/g, '`');
code = code.replace(/\\\$/g, '$');
fs.writeFileSync('server/src/controllers/packagesController.js', code);
