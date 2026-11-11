/**
 * Consistent formatting for every ExcelJS export: bold shaded header, frozen header row, auto filter,
 * ₹ number format on money columns, dd-mm-yyyy on date columns, sensible widths.
 */
const MONEY = /(amount|total|price|revenue|paid|due|cost|salary|balance|profit|income|expense|gst|tax|value|bonus|deduction|incentive|net)/i;
const DATE = /(date|_at$|day|month)/i;

function polishWorkbook(workbook) {
  workbook.eachSheet((ws) => {
    const cols = ws.columns || [];
    if (!cols.length) return;
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    header.alignment = { vertical: 'middle' };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    cols.forEach((c, i) => {
      const key = String(c.key || c.header || '');
      if (MONEY.test(key)) c.numFmt = '"₹"#,##0.00';
      else if (DATE.test(key)) c.numFmt = 'dd-mm-yyyy';
      if (!c.width || c.width < 10) c.width = Math.max(12, String(c.header || '').length + 4);
      ws.getColumn(i + 1).alignment = MONEY.test(key) ? { horizontal: 'right' } : { horizontal: 'left' };
    });
    if (ws.rowCount > 1) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  });
  return workbook;
}

module.exports = { polishWorkbook };
