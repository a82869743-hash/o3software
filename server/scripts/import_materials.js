/**
 * Adds the studio's material list (Excel: NO | BRAND NAME | DESCRIPTION | VOLUME | RATE) to Inventory
 * under the "Studio Materials" category. These are supplies the studio uses, not products for sale:
 * they never show in the customer shop. RATE is saved as the cost price. Safe to re-run — an item
 * with the same brand, name and pack size is updated, not added twice. Stock starts at 0 with no
 * low-stock alert until the studio enters stock.
 *
 *   node scripts/import_materials.js "FOR SOFTWARE USE.xlsx"            → shows what would change
 *   node scripts/import_materials.js "FOR SOFTWARE USE.xlsx" --yes      → saves it
 *   add --franchise=2 to load it for another studio (default 1)
 */
require('dotenv').config();
const XLSX = require('xlsx');
const pool = require('../src/config/db');

const CATEGORY = 'Studio Materials';

(async () => {
  const file = process.argv[2];
  const apply = process.argv.includes('--yes');
  const fid = Number((process.argv.find(a => a.startsWith('--franchise=')) || '=1').split('=')[1]) || 1;
  if (!file) { console.log('Usage: node scripts/import_materials.js <file.xlsx> [--yes] [--franchise=1]'); process.exit(1); }

  const ws = XLSX.readFile(file).Sheets[XLSX.readFile(file).SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }).slice(1);
  const clean = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
  const titleCase = (s) => s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\b(Ppf|Da|Ub|Gsm|Ml|Lt|Ltr)\b/g, m => m.toUpperCase());

  let added = 0, updated = 0, noRate = [];
  for (const r of rows) {
    const name = titleCase(clean(r[2]));
    if (!name) continue;
    const brand = clean(r[1]) || null;
    const size = clean(r[3]);
    const pack = !size || size === '1' ? null : size.toUpperCase().replace(/\s+/g, ' ');
    const unit = pack ? 'pack' : 'pcs';
    const rate = Number(r[4]) || 0;
    if (!rate) noRate.push(`${brand ? brand + ' ' : ''}${name}`);

    const [[found]] = await pool.query(
      `SELECT id FROM inventory WHERE is_deleted = 0 AND franchise_id = ? AND category = ? AND product_name = ?
         AND COALESCE(brand, '') = ? AND COALESCE(variant, '') = ? LIMIT 1`,
      [fid, CATEGORY, name, brand || '', pack || '']);

    if (found) {
      if (apply) await pool.query('UPDATE inventory SET cost_price = ? WHERE id = ?', [rate, found.id]);
      updated++;
    } else {
      if (apply) {
        await pool.query(
          `INSERT INTO inventory (product_name, brand, category, variant, unit, quantity, low_stock_threshold,
             cost_price, selling_price, status, franchise_id, description)
           VALUES (?, ?, ?, ?, ?, 0, 0, ?, 0, 'active', ?, ?)`,
          [name, brand, CATEGORY, pack, unit, rate, fid, 'Studio material (for use in services, not for sale)']);
      }
      added++;
    }
  }
  console.log(`${apply ? '' : '[dry run] '}${added} new, ${updated} already there (cost updated) — category "${CATEGORY}", studio ${fid}`);
  if (noRate.length) console.log(`${noRate.length} without a rate in the sheet (cost left at 0, set it in Inventory):\n  - ${noRate.join('\n  - ')}`);
  if (!apply) console.log('\nNothing saved. Run again with --yes to save.');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
