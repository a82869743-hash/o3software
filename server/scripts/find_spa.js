const pool = require('../src/config/db');

(async () => {
  try {
    const [tables] = await pool.query('SHOW TABLES');
    const tableNames = tables.map(r => Object.values(r)[0]);
    console.log('Searching in tables:', tableNames.length);
    for (const t of tableNames) {
      const [cols] = await pool.query(`DESCRIBE \`${t}\``);
      const textCols = cols.filter(c => /char|text/i.test(c.Type)).map(c => c.Field);
      for (const col of textCols) {
        try {
          // MySQL 8+ regex word boundary: \\b
          const [rows] = await pool.query(`SELECT \`${col}\` as val FROM \`${t}\` WHERE \`${col}\` REGEXP '\\\\b[Ss][Pp][Aa]\\\\b' LIMIT 5`);
          if (rows.length > 0) {
            console.log(`MATCH in ${t}.${col}: ${rows.length} rows (sample: ${rows[0].val?.slice(0, 70)})`);
          }
        } catch(e) {
          // Fallback if REGEXP word boundary differs
          const [rows] = await pool.query(`SELECT \`${col}\` as val FROM \`${t}\` WHERE \`${col}\` LIKE '%spa%' OR \`${col}\` LIKE '%Spa%' LIMIT 5`);
          const matches = rows.filter(r => /\bspa\b/i.test(r.val));
          if (matches.length > 0) {
            console.log(`MATCH (fallback) in ${t}.${col}: ${matches.length} rows (sample: ${matches[0].val?.slice(0, 70)})`);
          }
        }
      }
    }
    console.log('Done searching DB.');
    process.exit(0);
  } catch(err) {
    console.error(err);
    process.exit(1);
  }
})();
