/**
 * importService — reads Excel/CSV and maps columns by MEANING, not exact header text.
 * "Mobile No.", "Phone", "mobile_number", "Contact" all map to `mobile`, etc.
 */
const xlsx = require('xlsx');
const { validateRegNo, normalizeMobile, isValidMobile, isValidEmail } = require('../utils/validators');

const norm = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const ALIASES = {
  customer_name: ['customername', 'name', 'fullname', 'customer', 'clientname', 'ownername'],
  mobile: ['mobilenumber', 'mobile', 'mobileno', 'phone', 'phonenumber', 'contact', 'contactno', 'whatsapp', 'cell'],
  email: ['email', 'emailid', 'emailaddress', 'mail'],
  reg_no: ['vehicleregno', 'regno', 'registrationno', 'registrationnumber', 'vehicleno', 'vehiclenumber', 'carnumber', 'carno', 'numberplate', 'rcnumber'],
  brand: ['carbrand', 'brand', 'make', 'manufacturer', 'company'],
  model: ['carmodel', 'model', 'vehiclemodel', 'car'],
  variant: ['variant', 'carvariant', 'trim'],
  category: ['category', 'cartype', 'vehiclecategory', 'segment', 'bodytype', 'type'],
  loyalty_credits: ['loyaltycredits', 'credits', 'points', 'loyaltypoints'],
  free_washes: ['freewashes', 'freewash'],
  wax_count: ['waxcount', 'wax'],
  package_name: ['packagename', 'package', 'amc', 'membership', 'plan', 'packagetaken'],
  purchase_date: ['purchasedate', 'startdate', 'boughton', 'datepurchased', 'packagedate', 'joiningdate', 'joindate', 'date'],
  end_date: ['enddate', 'expirydate', 'validtill', 'expiry', 'validupto', 'expireson'],
  total_price: ['totalprice', 'packageprice', 'packagevalue', 'packageamount', 'totalamount', 'total', 'billamount', 'price', 'amount', 'cost'],
  price_paid: ['pricepaid', 'amountpaid', 'paid', 'paidamount', 'received', 'amountreceived', 'advance', 'advancepaid', 'advanceamount', 'advancereceived'],
  pending: ['pending', 'pendingamount', 'balance', 'balancedue', 'balanceamount', 'due', 'dueamount', 'outstanding', 'remainingamount', 'tobepaid'],
  due_date: ['duedate', 'balanceduedate', 'paybydate', 'paymentduedate'],
  payment_mode: ['paymentmode', 'paymentmethod', 'mode', 'paidby', 'paidvia'],
  services_used: ['servicesused', 'washesused', 'used', 'usedcount', 'consumed', 'visitsdone', 'washesdone', 'servicesdone', 'servicestaken', 'visits'],
  services_left: ['servicesleft', 'washesleft', 'remaining', 'remainingwashes', 'remainingservices', 'balanceservices', 'left'],
  last_visit: ['lastvisit', 'lastservice', 'lastservicedate', 'lastvisitdate', 'lastwash', 'lastwashdate'],
  service_history: ['servicehistory', 'services', 'servicedetails', 'history', 'workdone', 'lastservicename'],
  notes: ['notes', 'remarks', 'remark', 'comment', 'comments', 'note'],
  address: ['address', 'area', 'location', 'city'],
  color: ['colour', 'color', 'carcolour', 'carcolor'],
  product_name: ['productname', 'product', 'item', 'itemname', 'name'],
  unit: ['unit', 'uom', 'units'],
  brand_name: ['brand', 'make', 'company', 'manufacturer'],
  gst_pct: ['gst', 'gstpct', 'gstpercent', 'tax', 'taxpercent', 'vat'],
  discount_pct: ['discount', 'discountpct', 'discountpercent', 'off'],
  quantity: ['quantity', 'qty', 'stock', 'currentstock', 'openingstock'],
  low_stock_threshold: ['lowstockthreshold', 'minquantity', 'minstock', 'reorderlevel', 'reorder'],
  sku: ['sku', 'code', 'itemcode', 'productcode'],
  cost_price: ['costprice', 'cost', 'purchaseprice'],
  selling_price: ['sellingprice', 'mrp', 'customerprice', 'saleprice', 'price'],
  franchise_price: ['franchiseprice', 'dealerprice', 'wholesaleprice'],
  staff_price: ['staffprice'],
  service_name: ['servicename', 'service', 'name'],
  description: ['description', 'details', 'about'],
  duration_minutes: ['durationminutes', 'duration', 'time', 'mins'],
  price_hatchback: ['pricehatchback', 'hatchback', 'hatch'],
  price_semi_sedan: ['priceminisuv', 'minisuv', 'compactsuv', 'pricesemisedan', 'semisedan'],
  price_sedan: ['pricesedan', 'sedan'],
  price_premium_sedan: ['priceluxury', 'luxury', 'pricepremiumsedan', 'premiumsedan'],
  price_suv: ['pricesuv', 'suv', 'muv'],
  price_premium_suv: ['priceluxurysuv', 'luxurysuv', 'pricepremiumsuv', 'premiumsuv'],
};

function pick(row, field) {
  const keys = Object.keys(row);
  for (const alias of ALIASES[field] || [field]) {
    const k = keys.find(x => norm(x) === alias);
    if (k !== undefined && row[k] !== null && String(row[k]).trim() !== '') return String(row[k]).trim();
  }
  return null;
}

const num = (v, d = 0) => {
  if (v === null || v === undefined || v === '') return d;
  const n = Number(String(v).replace(/[₹,\s]/g, ''));
  return isNaN(n) ? NaN : n;
};

const CATS = { hatchback: 'hatchback', hatch: 'hatchback', 'premium hatchback': 'hatchback', 'medium hatchback': 'hatchback', 'mini suv': 'semi_sedan', 'compact suv': 'semi_sedan',
  sedan: 'sedan', 'premium sedan': 'premium_sedan', suv: 'suv', muv: 'suv', premium_suv: 'premium_suv',
  'semi sedan': 'sedan', 'semi-sedan': 'sedan', semi_sedan: 'semi_sedan', 'compact sedan': 'sedan', premium_sedan: 'premium_sedan',
  'premium suv': 'premium_suv', 'luxury suv': 'premium_suv', 'luxury + suv': 'premium_suv', luxury: 'premium_sedan' };

/** Date from Excel: 2026-03-15, 15/03/2026, 15-03-26, 15.03.2026, "15 Mar 2026", an Excel day number, or a Date. Indian day-first. */
function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  const t = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(t);
  if (m) {
    let y = Number(m[3]); if (y < 100) y += 2000;
    let dd = Number(m[1]), mm = Number(m[2]);
    if (mm > 12 && dd <= 12) [dd, mm] = [mm, dd]; // written month-first (3/15/2026)
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const d = new Date(y, mm - 1, dd); return d.getMonth() === mm - 1 ? d : null;
  }
  if (/^\d{5}(\.\d+)?$/.test(t)) { const d = new Date(Math.round((Number(t) - 25569) * 864e5)); return isNaN(d) ? null : new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
  const d = new Date(t);
  return isNaN(d) ? null : d;
}

/** Excel date cell → 'yyyy-mm-dd' (a few hours added so a cell stored a little before midnight keeps its day). */
function dateCell(v) {
  if (isNaN(v)) return null;
  const d = new Date(v.getTime() + 6 * 3600e3);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Which header went to which field; headers we do not know are listed so nothing is silently dropped. */
function mapHeaders(headers, fields) {
  const mapped = []; const unknown = [];
  for (const h of headers) {
    const f = fields.find(fl => (ALIASES[fl] || [fl]).includes(norm(h)));
    if (f) mapped.push({ header: h, field: f }); else if (String(h).trim() && !/^__EMPTY/.test(h)) unknown.push(h);
  }
  return { mapped, unknown };
}

const CUSTOMER_FIELDS = ['customer_name', 'mobile', 'email', 'reg_no', 'brand', 'model', 'variant', 'category', 'loyalty_credits', 'free_washes', 'wax_count',
  'package_name', 'purchase_date', 'end_date', 'total_price', 'price_paid', 'pending', 'due_date', 'payment_mode', 'services_used', 'services_left',
  'last_visit', 'service_history', 'notes', 'address', 'color'];
const INVENTORY_FIELDS = ['product_name', 'unit', 'quantity', 'low_stock_threshold', 'sku', 'category', 'cost_price', 'selling_price', 'franchise_price',
  'staff_price', 'brand_name', 'description', 'gst_pct', 'discount_pct'];

class ImportService {
  parseFile(buffer) {
    const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return xlsx.utils.sheet_to_json(sheet, { raw: false, defval: null, dateNF: 'yyyy-mm-dd' });
  }

  /**
   * Every sheet whose headers include one of `needAny` (e.g. name / mobile). The header row may be
   * below a title row: the first row (of the top 10) that has a known header is used.
   * Returns rows tagged with _sheet / _row and a per-sheet column report.
   */
  readSheets(buffer, fields, needAny) {
    const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
    const rows = []; const sheets = [];
    for (const name of workbook.SheetNames) {
      // raw values: real date cells come as Date (no US/Indian guessing), numbers as numbers, text as typed
      const grid = xlsx.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false })
        .map(line => (line || []).map(v => (v instanceof Date ? dateCell(v) : v)));
      let hi = -1;
      for (let i = 0; i < Math.min(10, grid.length); i++) {
        const heads = (grid[i] || []).map(h => String(h ?? ''));
        if (needAny.some(f => heads.some(h => (ALIASES[f] || [f]).includes(norm(h))))) { hi = i; break; }
      }
      if (hi < 0) { sheets.push({ sheet: name, used: false, reason: 'no known column headers' }); continue; }
      const headers = (grid[hi] || []).map((h, i) => (h === null || String(h).trim() === '' ? `__EMPTY${i}` : String(h).trim()));
      const report = mapHeaders(headers, fields);
      let count = 0;
      for (let r = hi + 1; r < grid.length; r++) {
        const line = grid[r] || [];
        if (!line.some(v => v !== null && String(v).trim() !== '')) continue;
        const obj = { _sheet: name, _row: r + 1 };
        headers.forEach((h, i) => { obj[h] = line[i] ?? null; });
        rows.push(obj); count++;
      }
      sheets.push({ sheet: name, used: true, header_row: hi + 1, rows: count, ...report });
    }
    return { rows, sheets };
  }

  validateCustomers(rows) {
    const valid = [];
    const errors = [];
    const known = new Set(CUSTOMER_FIELDS.flatMap(f => ALIASES[f] || [f]));
    rows.forEach((row, index) => {
      const rowNum = row._row || index + 2;
      const where = row._sheet ? `${row._sheet} row ${rowNum}` : `row ${rowNum}`;
      const name = pick(row, 'customer_name');
      const mobileRaw = pick(row, 'mobile');
      if (!name && !mobileRaw) return; // empty line
      if (!name) return errors.push({ row: rowNum, where, field: 'customer_name', reason: 'Customer name is missing' });
      if (!isValidMobile(mobileRaw)) return errors.push({ row: rowNum, where, field: 'mobile', reason: `Mobile "${mobileRaw || ''}" is not a 10-digit Indian mobile` });
      const email = pick(row, 'email');
      const money = (f) => { const v = pick(row, f); if (v === null) return null; const n = num(v); return isNaN(n) ? null : n; };
      const extra = Object.keys(row).filter(k => !k.startsWith('_') && !known.has(norm(k)) && row[k] !== null && String(row[k]).trim() !== '' && !/^__EMPTY/.test(k))
        .map(k => `${k}: ${String(row[k]).trim()}`);
      valid.push({
        _rowIndex: rowNum, _where: where,
        customer_name: name.slice(0, 100),
        mobile_number: normalizeMobile(mobileRaw),
        email: email && isValidEmail(email) ? email : null,
        bad_email: email && !isValidEmail(email) ? email : null,
        reg_raw: pick(row, 'reg_no'),
        car_brand: (pick(row, 'brand') || '').slice(0, 80) || null,
        car_model: (pick(row, 'model') || '').slice(0, 80) || null,
        variant: pick(row, 'variant'),
        color: pick(row, 'color'),
        category: CATS[String(pick(row, 'category') || '').toLowerCase()] || null,
        loyalty_credits: num(pick(row, 'loyalty_credits')) || 0,
        free_washes: num(pick(row, 'free_washes')) || 0,
        wax_count: num(pick(row, 'wax_count')) || 0,
        package_name: pick(row, 'package_name'),
        purchase_date: parseDate(pick(row, 'purchase_date')),
        end_date: parseDate(pick(row, 'end_date')),
        total_price: money('total_price'),
        price_paid: money('price_paid'),
        pending: money('pending'),
        due_date: parseDate(pick(row, 'due_date')),
        payment_mode: pick(row, 'payment_mode'),
        services_used: money('services_used'),
        services_left: money('services_left'),
        last_visit: parseDate(pick(row, 'last_visit')),
        last_visit_raw: pick(row, 'last_visit'),
        service_history: pick(row, 'service_history'),
        notes: pick(row, 'notes'),
        address: pick(row, 'address'),
        extra,
      });
    });
    return { valid, errors };
  }

  validateInventory(rows) {
    const valid = [];
    const errors = [];
    rows.forEach((row, index) => {
      const rowNum = row._row || index + 2;
      const name = pick(row, 'product_name');
      if (!name && !pick(row, 'quantity')) return; // empty line
      if (!name) return errors.push({ row: rowNum, field: 'product_name', reason: 'Product name is required' });
      const quantity = num(pick(row, 'quantity'));
      if (isNaN(quantity) || quantity < 0) return errors.push({ row: rowNum, field: 'quantity', reason: 'Quantity must be a positive number' });
      const rec = {
        _rowIndex: rowNum,
        product_name: name.slice(0, 150),
        unit: (pick(row, 'unit') || 'pcs').slice(0, 30),
        quantity,
        low_stock_threshold: num(pick(row, 'low_stock_threshold'), 5) || 5,
        sku: pick(row, 'sku'),
        category: pick(row, 'category'),
        brand: pick(row, 'brand_name'),
        description: pick(row, 'description'),
      };
      for (const f of ['gst_pct', 'discount_pct']) {
        const v = pick(row, f);
        if (v !== null) { let n = num(String(v).replace('%', '')); if (n > 0 && n < 1 && !String(v).includes('%')) n = Math.round(n * 10000) / 100; if (!isNaN(n) && n >= 0 && n <= 100) rec[f] = n; }
      }
      for (const f of ['cost_price', 'selling_price', 'franchise_price', 'staff_price']) {
        const v = pick(row, f);
        if (v !== null) {
          const n = num(v);
          if (isNaN(n) || n < 0) return errors.push({ row: rowNum, field: f, reason: `${f.replace('_', ' ')} must be a positive number` });
          rec[f] = n;
        }
      }
      valid.push(rec);
    });
    return { valid, errors };
  }

  validateServices(rows) {
    const valid = [];
    const errors = [];
    const priceFields = ['price_hatchback', 'price_semi_sedan', 'price_sedan', 'price_premium_sedan', 'price_suv', 'price_premium_suv'];
    rows.forEach((row, index) => {
      const rowNum = index + 2;
      const name = pick(row, 'service_name');
      if (!name) return errors.push({ row: rowNum, field: 'service_name', reason: 'Service name is required' });
      const rec = { _rowIndex: rowNum, name: name.slice(0, 150), description: pick(row, 'description'), category: pick(row, 'category') };
      const dur = num(pick(row, 'duration_minutes'), 60);
      rec.duration_minutes = isNaN(dur) || dur <= 0 ? 60 : Math.round(dur);
      for (const f of priceFields) {
        const n = num(pick(row, f), 0);
        if (isNaN(n) || n < 0) return errors.push({ row: rowNum, field: f, reason: `${f.replace('price_', '')} price must be a positive number` });
        rec[f] = n;
      }
      if (priceFields.every(f => !rec[f])) return errors.push({ row: rowNum, field: 'price', reason: 'At least one price is required' });
      // Fill missing tiers from the nearest given price so every car type has a price
      const order = priceFields.map(f => rec[f]);
      for (let i = 0; i < order.length; i++) if (!order[i]) order[i] = order.slice(0, i).reverse().find(Boolean) || order.find(Boolean);
      priceFields.forEach((f, i) => { rec[f] = order[i]; });
      valid.push(rec);
    });
    return { valid, errors };
  }
}

const svc = new ImportService();
svc.parseDate = parseDate; svc.CUSTOMER_FIELDS = CUSTOMER_FIELDS; svc.INVENTORY_FIELDS = INVENTORY_FIELDS; svc.pick = pick;
module.exports = svc;
