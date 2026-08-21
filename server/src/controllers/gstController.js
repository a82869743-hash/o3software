const pool = require('../config/db');

exports.getReport = async (req, res) => {
  try {
    const { month, year, format } = req.query;
    const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;
    const currentYear = year ? parseInt(year) : new Date().getFullYear();

    const [records] = await pool.query(
      `SELECT r.*,
              jc.invoice_number as job_invoice,
              p.invoice_number as purchase_invoice,
              v.name as vendor_name,
              u.name as customer_name
       FROM v2_gst_records r
       LEFT JOIN job_carts jc ON r.invoice_id = jc.id
       LEFT JOIN v2_purchases p ON r.purchase_id = p.id
       LEFT JOIN vendors v ON p.vendor_id = v.id
       LEFT JOIN vehicles veh ON jc.vehicle_id = veh.id
       LEFT JOIN users u ON veh.customer_id = u.id
       WHERE r.period_month = ? AND r.period_year = ?
       ORDER BY r.created_at DESC`,
      [currentMonth, currentYear]
    );

    // Aggregate totals
    let totalTaxableSales = 0;
    let totalGstSales = 0;
    let totalTaxablePurchases = 0;
    let totalGstPurchases = 0;

    records.forEach(r => {
      const taxable = parseFloat(r.taxable_amount || 0);
      const gst = parseFloat(r.total_gst || 0);
      if (r.record_type === 'sales') {
        totalTaxableSales += taxable;
        totalGstSales += gst;
      } else {
        totalTaxablePurchases += taxable;
        totalGstPurchases += gst;
      }
    });

    if (format === 'csv') {
      let csv = 'Type,Invoice/Ref,GSTIN,Taxable Amount (INR),CGST (INR),SGST (INR),IGST (INR),Total GST (INR),Month,Year,Created At\n';
      records.forEach(r => {
        const invNo = r.record_type === 'sales' ? (r.job_invoice || `Ref #${r.id}`) : (r.purchase_invoice || `Ref #${r.id}`);
        csv += `"${r.record_type.toUpperCase()}","${invNo}","${r.gstin || ''}",${r.taxable_amount},${r.cgst},${r.sgst},${r.igst},${r.total_gst},${r.period_month},${r.period_year},"${new Date(r.created_at).toLocaleDateString('en-IN')}"\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=GST_Report_${currentMonth}_${currentYear}.csv`);
      return res.send(csv);
    }

    res.json({
      success: true,
      data: {
        period: { month: currentMonth, year: currentYear },
        summary: {
          sales: { taxable: totalTaxableSales, gst: totalGstSales, total: totalTaxableSales + totalGstSales },
          purchases: { taxable: totalTaxablePurchases, gst: totalGstPurchases, total: totalTaxablePurchases + totalGstPurchases },
          net_gst_payable: totalGstSales - totalGstPurchases
        },
        records
      }
    });
  } catch (err) {
    console.error('GST Report error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
