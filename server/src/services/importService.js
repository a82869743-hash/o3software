const xlsx = require('xlsx');

class ImportService {
  /**
   * Parse an uploaded Excel/CSV file from buffer
   */
  parseFile(buffer, fileName) {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(sheet, { raw: false, defval: null });
  }

  /**
   * Validate Customer Data
   * Headers per BUSINESS_LOGIC.md:
   *   customer_name, mobile_number, email, vehicle_reg_no, car_brand, car_model,
   *   loyalty_credits, free_washes, wax_count
   */
  validateCustomers(rows) {
    const valid = [];
    const errors = [];

    rows.forEach((row, index) => {
      const rowNum = index + 2; // Excel row (header=1, data starts at 2)

      // Case-insensitive header matching
      const customerName = row['customer_name'] || row['Customer Name'] || row['name'] || row['Name'];
      const mobileNumber = row['mobile_number'] || row['Mobile Number'] || row['mobile'] || row['Mobile'];
      const email = row['email'] || row['Email'];
      const vehicleRegNo = row['vehicle_reg_no'] || row['Vehicle Reg No'] || row['reg_no'] || row['registration_no'];
      const carBrand = row['car_brand'] || row['Car Brand'] || row['brand'] || row['Brand'];
      const carModel = row['car_model'] || row['Car Model'] || row['model'] || row['Model'];
      const loyaltyCredits = row['loyalty_credits'] || row['Loyalty Credits'] || '0';
      const freeWashes = row['free_washes'] || row['Free Washes'] || '0';
      const waxCount = row['wax_count'] || row['Wax Count'] || '0';

      // Validate required fields
      if (!customerName) {
        errors.push({ row: rowNum, field: 'customer_name', reason: 'Customer name is required' });
        return;
      }
      if (!mobileNumber) {
        errors.push({ row: rowNum, field: 'mobile_number', reason: 'Mobile number is required' });
        return;
      }
      if (!vehicleRegNo) {
        errors.push({ row: rowNum, field: 'vehicle_reg_no', reason: 'Vehicle reg no is required' });
        return;
      }
      if (!carBrand) {
        errors.push({ row: rowNum, field: 'car_brand', reason: 'Car brand is required' });
        return;
      }
      if (!carModel) {
        errors.push({ row: rowNum, field: 'car_model', reason: 'Car model is required' });
        return;
      }

      // Validate mobile format: 10 digits
      const cleanMobile = String(mobileNumber).replace(/\D/g, '');
      if (cleanMobile.length !== 10) {
        errors.push({ row: rowNum, field: 'mobile_number', reason: 'Invalid format — must be 10 digits' });
        return;
      }

      const packageName = row['package_name'] || row['Package Name'] || row['package'] || row['Package'];
      const purchaseDate = row['purchase_date'] || row['Purchase Date'] || row['start_date'] || row['Start Date'];
      const endDate = row['end_date'] || row['End Date'] || row['expiry_date'] || row['Expiry Date'];
      const pricePaid = row['price_paid'] || row['Price Paid'] || row['price'] || row['Price'];

      valid.push({
        _rowIndex: rowNum,
        customer_name: String(customerName).trim(),
        mobile_number: cleanMobile,
        email: email ? String(email).trim() : null,
        vehicle_reg_no: String(vehicleRegNo).trim(),
        car_brand: String(carBrand).trim(),
        car_model: String(carModel).trim(),
        loyalty_credits: loyaltyCredits,
        free_washes: freeWashes,
        wax_count: waxCount,
        package_name: packageName ? String(packageName).trim() : null,
        purchase_date: purchaseDate ? String(purchaseDate).trim() : null,
        end_date: endDate ? String(endDate).trim() : null,
        price_paid: pricePaid ? parseFloat(pricePaid) : null,
      });
    });

    return { valid, errors };
  }

  /**
   * Validate Inventory Data
   * Headers: product_name, unit, quantity, low_stock_threshold
   */
  validateInventory(rows) {
    const valid = [];
    const errors = [];

    rows.forEach((row, index) => {
      const rowNum = index + 2;

      const name = row['product_name'] || row['Product Name'] || row['name'] || row['Name'];
      const unit = row['unit'] || row['Unit'] || 'pcs';
      const quantity = Number(row['quantity'] || row['Quantity'] || row['current_stock'] || row['Current Stock'] || 0);
      const threshold = Number(row['low_stock_threshold'] || row['Low Stock Threshold'] || row['min_quantity'] || row['Min Quantity'] || 5);

      if (!name) {
        errors.push({ row: rowNum, field: 'product_name', reason: 'Product name is required' });
        return;
      }
      if (isNaN(quantity)) {
        errors.push({ row: rowNum, field: 'quantity', reason: 'Invalid quantity' });
        return;
      }

      valid.push({
        product_name: String(name).trim(),
        unit: String(unit).trim(),
        quantity,
        low_stock_threshold: threshold,
      });
    });

    return { valid, errors };
  }
}

module.exports = new ImportService();
