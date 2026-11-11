import { ymd } from './formatters';
import * as XLSX from 'xlsx';

export interface ExcelColumn<T> {
  header: string;
  /** property name or accessor */
  value: keyof T | ((row: T) => string | number | null | undefined);
  /** 'money' → ₹ number format, 'date' → dd-mm-yyyy, 'number' */
  type?: 'text' | 'money' | 'number' | 'date';
  width?: number;
}

const toDate = (v: any): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Consistent Excel export used across the app: fixed column order, header row, column widths,
 * real numbers for amounts (summable in Excel), real dates, a title row and a totals row for money columns.
 */
export function exportToExcel<T>(fileName: string, sheetName: string, columns: ExcelColumn<T>[], rows: T[], title?: string) {
  const header = columns.map(c => c.header);
  const body = rows.map(r => columns.map(c => {
    const raw = typeof c.value === 'function' ? (c.value as any)(r) : (r as any)[c.value];
    if (c.type === 'money' || c.type === 'number') {
      const n = Number(raw);
      return raw === null || raw === undefined || raw === '' || isNaN(n) ? null : Math.round(n * 100) / 100;
    }
    if (c.type === 'date') return toDate(raw);
    return raw === null || raw === undefined ? '' : String(raw);
  }));

  const aoa: any[][] = [];
  if (title) aoa.push([title], [`Generated ${new Date().toLocaleString('en-IN')}`], []);
  const headerRow = aoa.length;
  aoa.push(header, ...body);
  if (columns.some(c => c.type === 'money') && rows.length) {
    aoa.push(columns.map((c, i) => {
      if (i === 0) return 'TOTAL';
      if (c.type !== 'money') return '';
      return body.reduce((s, r) => s + (Number(r[i]) || 0), 0);
    }));
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  ws['!cols'] = columns.map(c => ({ wch: c.width || Math.max(12, c.header.length + 2) }));
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = headerRow + 1; R <= range.e.r; R++) {
    columns.forEach((c, C) => {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (!cell) return;
      if (c.type === 'money') cell.z = '"₹"#,##0.00';
      if (c.type === 'date') cell.z = 'dd-mm-yyyy';
    });
  }
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: headerRow + rows.length, c: columns.length - 1 } }) };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const stamp = ymd();
  XLSX.writeFile(wb, `${fileName}_${stamp}.xlsx`);
}
