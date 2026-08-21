const fs = require('fs');

const csv = fs.readFileSync('car model dataset.csv', 'utf8');
const lines = csv.split('\n').slice(1).filter(l => l.trim());

const rows = [];
lines.forEach(l => {
  const c = l.split(',');
  let make = (c[1] || '').trim();
  const model = (c[2] || '').trim();
  const variant = (c[3] || '').trim();
  if (!make || !model) return;
  
  // Normalize
  if (make === 'Bmw') make = 'BMW';
  if (make === 'Mg') make = 'MG';
  if (make === 'Dc') make = 'DC';
  if (make === 'Icml') make = 'ICML';
  if (make === 'Land Rover Rover') make = 'Land Rover';
  if (make === 'Maruti Suzuki R') make = 'Maruti Suzuki';

  const esc = s => s.replace(/'/g, "''");
  rows.push(`('${esc(make)}','${esc(model)}','${esc(variant)}')`);
});

let sql = 'TRUNCATE TABLE vehicle_master;\n';
sql += 'INSERT INTO vehicle_master (make, model, variant) VALUES\n';
sql += rows.join(',\n') + ';\n';

fs.writeFileSync('seed_vehicle_master.sql', sql, 'utf8');
console.log(`Generated ${rows.length} rows`);
