/**
 * The car list lives in server/src/data/carCatalog.json. The app (client) needs the same file:
 * run `node scripts/sync_car_catalog.js` after editing it. With --check it only reports a difference.
 */
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'src', 'data', 'carCatalog.json');
const dst = path.join(__dirname, '..', '..', 'client', 'src', 'data', 'carCatalog.json');
const a = fs.readFileSync(src, 'utf8');
JSON.parse(a); // stop on a broken file
if (process.argv.includes('--check')) {
  const same = fs.existsSync(dst) && fs.readFileSync(dst, 'utf8') === a;
  console.log(same ? 'Car list is the same in server and app' : 'Car list differs: run node scripts/sync_car_catalog.js');
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(dst, a);
console.log('Copied car list to the app');
