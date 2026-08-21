const fs = require('fs');
const f = 'server/src/controllers/jobCartController.js';
let c = fs.readFileSync(f, 'utf8');

// Find the broken line and replace it
const lines = c.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('status !== \'all\')') && lines[i].includes('\\n')) {
    // Replace the broken single line with proper multi-line code
    lines[i] = [
      "    if (status && status !== 'all') {",
      "      where += ' AND jc.status = ?';",
      "      params.push(status);",
      "    } else {",
      '      where += " AND jc.status != \'cancelled\'";',
      "    }",
    ].join('\n');
    break;
  }
}

fs.writeFileSync(f, lines.join('\n'));
console.log('Fixed jobCartController.js');
