const fs = require('fs');
const path = require('path');

const envVars = new Set();

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (f === 'node_modules' || f === '.git') continue;
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      scanDir(full);
    } else if (f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.tsx')) {
      const content = fs.readFileSync(full, 'utf8');
      const matches = content.matchAll(/process\.env\.([A-Z0-9_]+)/g);
      for (const m of matches) {
        envVars.add(m[1]);
      }
    }
  }
}

scanDir(path.join(__dirname, '..', 'src'));
console.log('Discovered process.env variables in server/src:');
const sorted = Array.from(envVars).sort();
console.log(sorted);
console.log(`Total: ${sorted.length}`);
