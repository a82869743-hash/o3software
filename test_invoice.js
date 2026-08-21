const { generateQuickWashInvoicePDF, generateInvoicePDF } = require('./server/src/services/invoiceService');

async function test() {
  try {
    console.log("Testing quick wash 1...");
    const { pdfBuffer } = await generateQuickWashInvoicePDF(1);
    console.log("Quick wash 1 success, buffer size:", pdfBuffer.length);
  } catch (e) {
    console.error("Quick wash error:", e);
  }

  try {
    console.log("Testing job cart 1...");
    const { pdfBuffer } = await generateInvoicePDF(1);
    console.log("Job cart 1 success, buffer size:", pdfBuffer.length);
  } catch (e) {
    console.error("Job cart error:", e);
  }

  process.exit(0);
}

test();
