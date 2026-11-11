/**
 * Per-franchise document numbering (invoices, quotations). Must be called inside a transaction
 * (uses SELECT ... FOR UPDATE on the counter row).
 */
async function nextNumber(conn, franchiseId, { prefixKey, counterKey, defaultPrefix }) {
  const fid = Number(franchiseId) || 1;
  const [[prefixRow]] = await conn.query(
    'SELECT value FROM settings WHERE key_name = ? AND franchise_id IN (1, ?) ORDER BY (franchise_id = ?) DESC LIMIT 1',
    [prefixKey, fid, fid]
  );
  await conn.query(
    'INSERT IGNORE INTO settings (franchise_id, key_name, value) VALUES (?, ?, ?)',
    [fid, counterKey, '0']
  );
  const [[counterRow]] = await conn.query(
    'SELECT value FROM settings WHERE franchise_id = ? AND key_name = ? FOR UPDATE',
    [fid, counterKey]
  );
  const next = (parseInt(counterRow?.value || '0', 10) || 0) + 1;
  await conn.query('UPDATE settings SET value = ? WHERE franchise_id = ? AND key_name = ?', [String(next), fid, counterKey]);
  const prefix = (prefixRow?.value || defaultPrefix).trim();
  const fy = new Date().getFullYear();
  return `${prefix}-${fy}-${String(next).padStart(4, '0')}`;
}

const nextInvoiceNumber = (conn, fid) =>
  nextNumber(conn, fid, { prefixKey: 'invoice_prefix', counterKey: 'invoice_counter', defaultPrefix: 'O3' });

const nextQuotationNumber = (conn, fid) =>
  nextNumber(conn, fid, { prefixKey: 'quotation_prefix', counterKey: 'quotation_counter', defaultPrefix: 'QT' });

module.exports = { nextNumber, nextInvoiceNumber, nextQuotationNumber };
