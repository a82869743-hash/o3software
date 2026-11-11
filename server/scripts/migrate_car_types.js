/**
 * migrate_car_types.js — one-time update after switching to the rate card's car types
 * (Hatchback, Sedan, Mini SUV, SUV, Luxury, Luxury + SUV; stored keys: semi_sedan = Mini SUV,
 * premium_sedan = Luxury, premium_suv = Luxury + SUV).
 *
 * Re-sorts every saved customer car by its model with the new list, e.g. Dzire: "semi_sedan" (old
 * Semi-sedan) → "sedan", Nexon: "suv" → "semi_sedan" (Mini SUV). Cars whose model isn't recognised
 * keep their type, except old Semi-sedan, which becomes Sedan. Past bookings keep the price they were charged.
 *
 *   node scripts/migrate_car_types.js          (shows what would change)
 *   node scripts/migrate_car_types.js --apply  (saves it)
 */
require('dotenv').config();
const pool = require('../src/config/db');
const { guessCarCategory } = require('../src/utils/carCategory');

(async () => {
  const apply = process.argv.includes('--apply');
  const [cars] = await pool.query('SELECT id, brand, model, category FROM vehicles');
  let n = 0;
  for (const c of cars) {
    const next = guessCarCategory(c.brand, c.model) || (c.category === 'semi_sedan' ? 'sedan' : c.category);
    if (!next || next === c.category) continue;
    n++;
    console.log(`#${c.id} ${c.brand || ''} ${c.model || ''}: ${c.category || '-'} → ${next}`);
    if (apply) await pool.query('UPDATE vehicles SET category = ? WHERE id = ?', [next, c.id]);
  }
  console.log(`\n${n} of ${cars.length} cars ${apply ? 'updated' : 'would change (run with --apply to save)'}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
