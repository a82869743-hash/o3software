const PDF_REGULAR = require('path').join(__dirname, '..', '..', 'assets', 'fonts', 'Manrope-400.woff');
const PDF_BOLD = require('path').join(__dirname, '..', '..', 'assets', 'fonts', 'Manrope-700.woff');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Ensure upload directories exist
const warrantiesDir = path.join(__dirname, '..', '..', 'uploads', 'warranties');
const billsDir = path.join(__dirname, '..', '..', 'uploads', 'bills');
if (!fs.existsSync(warrantiesDir)) fs.mkdirSync(warrantiesDir, { recursive: true });
if (!fs.existsSync(billsDir)) fs.mkdirSync(billsDir, { recursive: true });

class PdfService {
  /**
   * Generate an Official Warranty Certificate PDF
   */
  async generateWarrantyPdf({
    certificateNo,
    customerName,
    customerMobile,
    customerEmail,
    vehicleRegNo,
    vehicleModel,
    vehicleBrand,
    serviceType,
    serviceName,
    warrantyYears = 3,
    issueDate,
    expiryDate,
    jobCardId,
    terms,
    franchiseName = 'O3 Car Spaa Elite Studio'
  }) {
    return new Promise((resolve, reject) => {
      try {
        const fileName = `warranty_${certificateNo.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
        const filePath = path.join(warrantiesDir, fileName);
        const writeStream = fs.createWriteStream(filePath);

        const doc = new PDFDocument({
          size: 'A4',
          margin: 40,
          info: {
            Title: `Warranty Certificate - ${certificateNo}`,
            Author: 'O3 Car Spaa',
            Subject: `${serviceType} Warranty Certificate`
          }
        });

        doc.pipe(writeStream);

        // --- STYLING CONSTANTS ---
        const primaryColor = '#0F172A'; // Deep Navy / Slate
        const goldColor = '#D97706';    // Premium Amber / Gold
        const lightBg = '#F8FAFC';      // Slate 50
        const darkText = '#1E293B';     // Slate 800
        const mutedText = '#64748B';    // Slate 500
        const borderColor = '#CBD5E1';  // Slate 300

        // Decorative Outer & Inner Border
        doc.rect(20, 20, 555, 802).lineWidth(2).stroke(goldColor);
        doc.rect(24, 24, 547, 794).lineWidth(0.75).stroke(primaryColor);

        // Header Background Banner
        doc.rect(25, 25, 545, 95).fill(primaryColor);

        // Header Brand Title
        doc.fillColor('#FFFFFF').fontSize(24).font(PDF_BOLD)
           .text('O3 CAR SPAA', 25, 45, { align: 'center', width: 545 });
        doc.fontSize(10).font(PDF_REGULAR)
           .text(franchiseName.toUpperCase(), 25, 75, { align: 'center', width: 545 });
        doc.fontSize(8).fillColor('#94A3B8')
           .text('PREMIUM AUTOMOTIVE SURFACE PROTECTION & DETAILING STUDIO', 25, 90, { align: 'center', width: 545 });

        // Certificate Badge Title
        doc.fillColor(goldColor).fontSize(16).font(PDF_BOLD)
           .text('OFFICIAL WARRANTY CERTIFICATE', 25, 135, { align: 'center', width: 545 });
        doc.fillColor(mutedText).fontSize(10).font(PDF_REGULAR)
           .text(`CERTIFICATE NUMBER: ${certificateNo}`, 25, 155, { align: 'center', width: 545 });

        // Divider Line
        doc.moveTo(60, 175).lineTo(535, 175).lineWidth(1).stroke(borderColor);

        // --- 2-COLUMN DETAILS CONTAINER ---
        const startY = 190;
        doc.rect(50, startY, 495, 165).fillAndStroke(lightBg, borderColor);

        // Left Column: Customer & Vehicle Details
        doc.fillColor(primaryColor).fontSize(11).font(PDF_BOLD)
           .text('CUSTOMER & VEHICLE DETAILS', 65, startY + 15);

        doc.fillColor(mutedText).fontSize(9).font(PDF_REGULAR)
           .text('Customer Name:', 65, startY + 40)
           .text('Mobile Number:', 65, startY + 60)
           .text('Email Address:', 65, startY + 80)
           .text('Vehicle Registration:', 65, startY + 105)
           .text('Vehicle Brand & Model:', 65, startY + 125);

        doc.fillColor(darkText).fontSize(9).font(PDF_BOLD)
           .text(customerName || 'N/A', 175, startY + 40)
           .text(customerMobile || 'N/A', 175, startY + 60)
           .text(customerEmail || 'N/A', 175, startY + 80)
           .text(vehicleRegNo || 'N/A', 175, startY + 105)
           .text(`${vehicleBrand || ''} ${vehicleModel || ''}`.trim() || 'N/A', 175, startY + 125);

        // Middle Divider
        doc.moveTo(295, startY + 10).lineTo(295, startY + 155).lineWidth(0.5).stroke(borderColor);

        // Right Column: Warranty & Service Details
        doc.fillColor(primaryColor).fontSize(11).font(PDF_BOLD)
           .text('WARRANTY SPECIFICATIONS', 310, startY + 15);

        doc.fillColor(mutedText).fontSize(9).font(PDF_REGULAR)
           .text('Service Type:', 310, startY + 40)
           .text('Package / Service:', 310, startY + 60)
           .text('Warranty Period:', 310, startY + 80)
           .text('Date of Application:', 310, startY + 105)
           .text('Warranty Expiry Date:', 310, startY + 125)
           .text('Job Card Reference:', 310, startY + 145);

        const formattedIssue = issueDate ? new Date(issueDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
        const formattedExpiry = expiryDate ? new Date(expiryDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';

        doc.fillColor(darkText).fontSize(9).font(PDF_BOLD)
           .text(serviceType || 'PPF Coating', 420, startY + 40)
           .text((serviceName || serviceType || '').substring(0, 24), 420, startY + 60)
           .text(`${warrantyYears} Year(s)`, 420, startY + 80)
           .text(formattedIssue, 420, startY + 105)
           .text(formattedExpiry, 420, startY + 125)
           .text(`#${jobCardId || 'N/A'}`, 420, startY + 145);

        // --- WARRANTY COVERAGE BADGE ---
        const badgeY = 375;
        doc.rect(50, badgeY, 495, 55).fillAndStroke('#FEF3C7', goldColor);
        doc.fillColor(goldColor).fontSize(11).font(PDF_BOLD)
           .text(`★  GUARANTEED PROTECTION: ${warrantyYears} YEARS OF WARRANTY COVERAGE  ★`, 50, badgeY + 12, { align: 'center', width: 495 });
        doc.fillColor('#78350F').fontSize(8.5).font(PDF_REGULAR)
           .text('Covers delamination, cracking, excessive yellowing, and optical gloss retention under normal operating conditions.', 50, badgeY + 32, { align: 'center', width: 495 });

        // --- TERMS & CONDITIONS SECTION ---
        const termsY = 445;
        doc.fillColor(primaryColor).fontSize(11).font(PDF_BOLD)
           .text('WARRANTY TERMS & CARE INSTRUCTIONS', 50, termsY);

        const defaultTerms = terms || [
          '1. Mandatory Annual Inspection: Vehicle must be brought for an annual top-coat checkup or maintenance wash.',
          '2. Care Instructions: Do not pressure wash edges closer than 45cm. Avoid harsh automatic car washes with abrasive brushes.',
          '3. Exclusions: Does not cover intentional damage, severe accidents, paint damage due to vandalism, or external acid etching.',
          '4. Transferability: Warranty is tied to the registered chassis / VIN and vehicle registration number shown on this certificate.',
          '5. Claim Procedure: Contact O3 Car Spaa support with this original certificate number for physical panel inspection.'
        ].join('\n\n');

        doc.fillColor(darkText).fontSize(8.5).font(PDF_REGULAR)
           .text(defaultTerms, 50, termsY + 20, { width: 495, lineGap: 3 });

        // --- AUTHENTICATION & SIGNATURE FOOTER ---
        const footerY = 680;
        doc.moveTo(50, footerY).lineTo(545, footerY).lineWidth(0.5).stroke(borderColor);

        // Official Stamp Simulation
        doc.rect(70, footerY + 15, 120, 60).lineWidth(1).dash(3, { space: 3 }).stroke(goldColor).undash();
        doc.fillColor(goldColor).fontSize(8).font(PDF_BOLD)
           .text('O3 CAR SPAA\nOFFICIAL QUALITY SEAL\nVERIFIED AUTHENTIC', 70, footerY + 30, { align: 'center', width: 120 });

        // Authorized Signature
        doc.moveTo(375, footerY + 60).lineTo(525, footerY + 60).lineWidth(1).stroke(primaryColor);
        doc.fillColor(primaryColor).fontSize(9).font(PDF_BOLD)
           .text('Authorized Signatory', 375, footerY + 65, { align: 'center', width: 150 });
        doc.fillColor(mutedText).fontSize(8).font(PDF_REGULAR)
           .text('O3 Car Spaa Technical Lead', 375, footerY + 77, { align: 'center', width: 150 });

        // Bottom Security Notice
        doc.fillColor(mutedText).fontSize(7.5).font(PDF_REGULAR)
           .text(`Electronic Document ID: ${certificateNo} | Generated on ${new Date().toISOString()}`, 25, 790, { align: 'center', width: 545 });

        doc.end();

        writeStream.on('finish', () => {
          const publicUrl = `/uploads/warranties/${fileName}`;
          resolve({ filePath, fileName, publicUrl });
        });

        writeStream.on('error', (err) => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Generate a Buy/Sell Bill Soft Copy PDF
   */
  async generateBuySellBillPdf({
    billId,
    invoiceNumber,
    type, // 'buy', 'sell_b2b', 'sell_b2c', 'manual_bill'
    partyName,
    partyMobile,
    productName,
    quantity,
    unitPrice,
    totalAmount,
    taxAmount = 0,
    discountAmount = 0,
    grandTotal,
    transactionDate,
    note,
    items = [],
    franchiseName = 'O3 Car Spaa'
  }) {
    return new Promise((resolve, reject) => {
      try {
        const safeInvNo = (invoiceNumber || `BILL-${billId || Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileName = `bill_${safeInvNo}.pdf`;
        const filePath = path.join(billsDir, fileName);
        const writeStream = fs.createWriteStream(filePath);

        const doc = new PDFDocument({
          size: 'A4',
          margin: 40,
          info: {
            Title: `Bill Soft Copy - ${invoiceNumber || billId}`,
            Author: 'O3 Car Spaa',
            Subject: 'Bill Soft Copy'
          }
        });

        doc.pipe(writeStream);

        const primaryColor = '#0F172A';
        const accentColor = '#2563EB'; // Blue
        const lightBg = '#F8FAFC';
        const darkText = '#1E293B';
        const mutedText = '#64748B';
        const borderColor = '#E2E8F0';

        // Outer Border
        doc.rect(25, 25, 545, 792).lineWidth(1).stroke(borderColor);

        // Header Top Bar
        doc.rect(25, 25, 545, 80).fill(primaryColor);
        doc.fillColor('#FFFFFF').fontSize(22).font(PDF_BOLD)
           .text('O3 CAR SPAA', 40, 42);
        doc.fontSize(9).font(PDF_REGULAR).fillColor('#94A3B8')
           .text(franchiseName.toUpperCase() + ' — OFFICIAL BILL SOFT COPY', 40, 68);

        // Bill Label Badge
        const typeLabels = {
          buy: 'PURCHASE ORDER / BUY BILL',
          sell_b2b: 'B2B SALES TAX INVOICE',
          sell_b2c: 'RETAIL SALE BILL',
          manual_bill: 'SERVICE & PRODUCT BILL'
        };
        const billTitle = typeLabels[type] || 'BILL SOFT COPY';

        doc.rect(360, 40, 190, 48).fillAndStroke('#1E293B', accentColor);
        doc.fillColor('#FFFFFF').fontSize(10).font(PDF_BOLD)
           .text(billTitle, 360, 48, { align: 'center', width: 190 });
        doc.fillColor('#93C5FD').fontSize(8.5).font(PDF_REGULAR)
           .text(`BILL NO: ${invoiceNumber || `INV-${billId}`}`, 360, 64, { align: 'center', width: 190 });

        // Bill Info Grid
        const gridY = 125;
        doc.rect(40, gridY, 515, 80).fillAndStroke(lightBg, borderColor);

        // Bill To
        doc.fillColor(primaryColor).fontSize(10).font(PDF_BOLD)
           .text('BILLED TO / PARTY:', 55, gridY + 12);
        doc.fillColor(darkText).fontSize(10).font(PDF_BOLD)
           .text(partyName || 'Customer / Partner', 55, gridY + 28);
        doc.fillColor(mutedText).fontSize(9).font(PDF_REGULAR)
           .text(`Contact: ${partyMobile || 'N/A'}`, 55, gridY + 44);

        // Date & Meta
        const formattedDate = transactionDate
          ? new Date(transactionDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
          : new Date().toLocaleDateString('en-IN');

        doc.fillColor(primaryColor).fontSize(10).font(PDF_BOLD)
           .text('BILL DETAILS:', 340, gridY + 12);
        doc.fillColor(mutedText).fontSize(9).font(PDF_REGULAR)
           .text(`Date of Bill:`, 340, gridY + 28)
           .text(`Payment Mode:`, 340, gridY + 44)
           .text(`Status:`, 340, gridY + 60);

        doc.fillColor(darkText).fontSize(9).font(PDF_BOLD)
           .text(formattedDate, 440, gridY + 28)
           .text('CONFIRMED', 440, gridY + 44)
           .text('PAID / SETTLED', 440, gridY + 60);

        // Table Header
        const tableY = 225;
        doc.rect(40, tableY, 515, 24).fill(primaryColor);
        doc.fillColor('#FFFFFF').fontSize(9).font(PDF_BOLD)
           .text('#', 50, tableY + 7, { width: 25 })
           .text('ITEM / SERVICE DESCRIPTION', 80, tableY + 7, { width: 230 })
           .text('QTY', 315, tableY + 7, { width: 45, align: 'right' })
           .text('UNIT PRICE', 375, tableY + 7, { width: 75, align: 'right' })
           .text('AMOUNT', 465, tableY + 7, { width: 80, align: 'right' });

        // Item Lines
        let currentY = tableY + 24;
        let lineItems = items.length > 0 ? items : [{
          name: productName || 'Product Item',
          quantity: quantity || 1,
          price: unitPrice || totalAmount || 0,
          total: totalAmount || (quantity * unitPrice) || 0
        }];

        lineItems.forEach((item, index) => {
          const rowBg = index % 2 === 0 ? '#FFFFFF' : lightBg;
          doc.rect(40, currentY, 515, 24).fillAndStroke(rowBg, borderColor);

          doc.fillColor(darkText).fontSize(8.5).font(PDF_REGULAR)
             .text(String(index + 1), 50, currentY + 7, { width: 25 })
             .text(String(item.name || item.product_name || item.service_name || 'Item').substring(0, 40), 80, currentY + 7, { width: 230 })
             .text(String(item.quantity || 1), 315, currentY + 7, { width: 45, align: 'right' })
             .text(`₹${parseFloat(item.price || item.unit_price || 0).toFixed(2)}`, 375, currentY + 7, { width: 75, align: 'right' })
             .text(`₹${parseFloat(item.total || item.total_amount || (item.quantity * item.price) || 0).toFixed(2)}`, 465, currentY + 7, { width: 80, align: 'right' });

          currentY += 24;
        });

        // Summary Box
        currentY += 15;
        const summaryY = currentY;
        doc.rect(320, summaryY, 235, 95).fillAndStroke(lightBg, borderColor);

        const effSubtotal = parseFloat(totalAmount || (quantity * unitPrice) || 0);
        const effGrandTotal = grandTotal !== undefined ? parseFloat(grandTotal) : (effSubtotal - discountAmount + taxAmount);

        doc.fillColor(mutedText).fontSize(9).font(PDF_REGULAR)
           .text('Subtotal:', 335, summaryY + 12)
           .text('Discount:', 335, summaryY + 28)
           .text('Tax / GST:', 335, summaryY + 44);

        doc.fillColor(darkText).fontSize(9).font(PDF_REGULAR)
           .text(`₹${effSubtotal.toFixed(2)}`, 450, summaryY + 12, { align: 'right', width: 90 })
           .text(`- ₹${parseFloat(discountAmount || 0).toFixed(2)}`, 450, summaryY + 28, { align: 'right', width: 90 })
           .text(`₹${parseFloat(taxAmount || 0).toFixed(2)}`, 450, summaryY + 44, { align: 'right', width: 90 });

        doc.moveTo(330, summaryY + 62).lineTo(545, summaryY + 62).lineWidth(0.5).stroke(borderColor);

        doc.fillColor(primaryColor).fontSize(11).font(PDF_BOLD)
           .text('Grand Total:', 335, summaryY + 70)
           .text(`₹${effGrandTotal.toFixed(2)}`, 440, summaryY + 70, { align: 'right', width: 100 });

        // Note
        if (note) {
          doc.fillColor(mutedText).fontSize(8.5).font(PDF_REGULAR)
             .text(`Note: ${note}`, 45, summaryY + 20, { width: 260 });
        }

        // Terms / Footer
        const termsY = 660;
        doc.moveTo(40, termsY).lineTo(555, termsY).lineWidth(0.5).stroke(borderColor);
        doc.fillColor(mutedText).fontSize(8).font(PDF_REGULAR)
           .text('Terms & Conditions:\n1. This document is a computer-generated soft copy bill valid without physical seal.\n2. Goods once sold cannot be returned after 7 calendar days.\n3. All disputes subject to local jurisdiction.', 40, termsY + 15, { width: 515 });

        // Footer info
        doc.fillColor(mutedText).fontSize(7.5).font(PDF_REGULAR)
           .text(`O3 Car Spaa Soft Copy Bill — Generated: ${new Date().toISOString()}`, 25, 790, { align: 'center', width: 545 });

        doc.end();

        writeStream.on('finish', () => {
          const publicUrl = `/uploads/bills/${fileName}`;
          resolve({ filePath, fileName, publicUrl });
        });

        writeStream.on('error', (err) => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = new PdfService();
