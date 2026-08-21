const pool = require('../config/db');

// ─── ADMIN STATS ────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const monthStart = today.slice(0, 8) + '01';

    const franchiseId = req.headers['x-franchise-id'] ? parseInt(req.headers['x-franchise-id'], 10) : 1;

    // Run all queries in parallel for speed
    const [
      [todayRev], [monthRev], [yesterdayRev],
      [jobCarts], [activeDeliveries], [inquiries],
      [purchases], [pendingPay], [lowStock], [lowStockDetails],
      [todayBookings], [totalCustomers], [recentCompletions],
      [staffPresent], [expiringPkgs],
      [pendingBookings], [pendingPackageReqs], [pendingProductOrders]
    ] = await Promise.all([
      // Revenue
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
         WHERE direction = 'in' AND transaction_date = ? AND (franchise_id = ? OR (franchise_id IS NULL AND ? = 1))`, [today, franchiseId, franchiseId]
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
         WHERE direction = 'in' AND transaction_date >= ? AND transaction_date <= ? AND (franchise_id = ? OR (franchise_id IS NULL AND ? = 1))`, [monthStart, today, franchiseId, franchiseId]
      ),
      // Yesterday revenue for comparison
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
         WHERE direction = 'in' AND transaction_date = DATE_SUB(?, INTERVAL 1 DAY) AND (franchise_id = ? OR (franchise_id IS NULL AND ? = 1))`, [today, franchiseId, franchiseId]
      ),
      // Job carts
      pool.query(`SELECT 
        COUNT(*) as total, 
        SUM(IF(status='complete', 1, 0)) as completed, 
        SUM(IF(status='open', 1, 0)) as open,
        SUM(IF(status='draft', 1, 0)) as draft
        FROM job_carts
        WHERE (franchise_id = ? OR (franchise_id IS NULL AND ? = 1))`, [franchiseId, franchiseId]),
      // Deliveries
      pool.query(`SELECT COUNT(*) as active FROM deliveries WHERE status='in_transit'`),
      // Inquiries
      pool.query(`SELECT COUNT(*) as new_leads FROM inquiries WHERE status='new' AND (franchise_id = ? OR (franchise_id IS NULL AND ? = 1))`, [franchiseId, franchiseId]),
      // Purchases
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
         WHERE direction = 'out' AND type = 'purchase'
         AND transaction_date >= ? AND transaction_date <= ? AND (franchise_id = ? OR (franchise_id IS NULL AND ? = 1))`, [monthStart, today, franchiseId, franchiseId]
      ),

      // Pending payments
      pool.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM staff_payments WHERE status = 'pending'`),
      // Low stock count
      pool.query(`SELECT COUNT(*) AS total FROM inventory WHERE quantity <= low_stock_threshold AND is_deleted = 0 AND (franchise_id = ? OR (franchise_id IS NULL AND ? = 1))`, [franchiseId, franchiseId]),
      // Low stock details array per franchise
      pool.query(
        `SELECT i.id, i.product_name, i.unit, i.quantity, i.low_stock_threshold, i.category,
                COALESCE(i.franchise_price, i.selling_price, 0) AS unit_price,
                i.franchise_id, f.name AS franchise_name, f.code AS franchise_code
         FROM inventory i
         LEFT JOIN franchises f ON i.franchise_id = f.id
         WHERE i.quantity <= i.low_stock_threshold AND i.is_deleted = 0
           AND (i.franchise_id = ? OR (i.franchise_id IS NULL AND ? = 1))
         ORDER BY i.quantity ASC
         LIMIT 10`, [franchiseId, franchiseId]
      ),
      // Today's bookings count
      pool.query(
        `SELECT COUNT(*) AS total FROM bookings b 
         JOIN slots s ON b.slot_id = s.id 
         WHERE s.slot_date = ? AND b.status = 'confirmed' AND (b.franchise_id = ? OR (b.franchise_id IS NULL AND ? = 1))`, [today, franchiseId, franchiseId]
      ),
      // Total customers
      pool.query(`SELECT COUNT(*) AS total FROM users WHERE role = 'customer' AND is_active = 1`),
      // Completed in last 7 days
      pool.query(
        `SELECT COUNT(*) AS total FROM job_carts 
         WHERE status = 'complete' AND completed_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND (franchise_id = ? OR (franchise_id IS NULL AND ? = 1))`, [franchiseId, franchiseId]
      ),
      // Staff present today
      pool.query(
        `SELECT COUNT(*) AS total FROM staff_attendance 
         WHERE att_date = CURDATE() AND status = 'present'`
      ),
      // Packages expiring in next 30 days
      pool.query(
        `SELECT up.id, up.end_date, u.name AS customer_name, u.mobile AS customer_mobile, p.name AS package_name
         FROM user_packages up
         JOIN users u ON up.user_id = u.id
         JOIN packages p ON up.package_id = p.id
         WHERE up.end_date IS NOT NULL
           AND up.end_date > NOW()
           AND up.end_date <= DATE_ADD(NOW(), INTERVAL 30 DAY)
           AND (up.franchise_id = ? OR (up.franchise_id IS NULL AND ? = 1))
         ORDER BY up.end_date ASC`, [franchiseId, franchiseId]
      ),
      // Pending Approvals Queries
      pool.query(`SELECT COUNT(*) AS total FROM bookings WHERE status = 'pending_approval' AND (franchise_id = ? OR (franchise_id IS NULL AND ? = 1))`, [franchiseId, franchiseId]),
      pool.query(`SELECT COUNT(*) AS total FROM package_requests WHERE status = 'pending'`),
      pool.query(`SELECT COUNT(*) AS total FROM product_orders WHERE payment_status = 'pending'`),
    ]);


    // Weekly data (last 7 days revenue + job count per day)
    const [weeklyRows] = await pool.query(`
      SELECT 
        DATE_FORMAT(jc.visit_date, '%a') AS day,
        DATE(jc.visit_date) AS date_val,
        COUNT(jc.id) AS jobs,
        COALESCE(SUM(t.amount), 0) AS revenue
      FROM job_carts jc
      LEFT JOIN transactions t ON t.type = 'job_revenue' AND t.reference_id = jc.id AND t.direction = 'in'
      WHERE jc.visit_date >= CURDATE() - INTERVAL 6 DAY AND (jc.franchise_id = ? OR (jc.franchise_id IS NULL AND ? = 1))
      GROUP BY DATE(jc.visit_date), DATE_FORMAT(jc.visit_date, '%a')
      ORDER BY date_val ASC
    `, [franchiseId, franchiseId]);

    // Service demand share (top 5 services by usage count in last 30 days, fallback to all time)
    let [demandRows] = await pool.query(`
      SELECT js.service_name AS name, COUNT(*) AS cnt
      FROM job_services js
      JOIN job_carts jc ON js.job_cart_id = jc.id
      WHERE jc.created_at >= CURDATE() - INTERVAL 30 DAY AND (jc.franchise_id = ? OR (jc.franchise_id IS NULL AND ? = 1))
      GROUP BY js.service_name
      ORDER BY cnt DESC
      LIMIT 5
    `, [franchiseId, franchiseId]);

    if (!demandRows || demandRows.length === 0) {
      // Fallback 1: Query all-time job_services
      const [allTimeRows] = await pool.query(`
        SELECT js.service_name AS name, COUNT(*) AS cnt
        FROM job_services js
        JOIN job_carts jc ON js.job_cart_id = jc.id
        WHERE (jc.franchise_id = ? OR (jc.franchise_id IS NULL AND ? = 1))
        GROUP BY js.service_name
        ORDER BY cnt DESC
        LIMIT 5
      `, [franchiseId, franchiseId]);
      demandRows = allTimeRows;
    }

    if (!demandRows || demandRows.length === 0) {
      // Fallback 2: Query active services catalog with booking counts
      const [catRows] = await pool.query(`
        SELECT s.name, COALESCE(COUNT(b.id), 1) AS cnt
        FROM services s
        LEFT JOIN bookings b ON b.service_id = s.id
        WHERE s.is_active = 1
        GROUP BY s.id, s.name
        ORDER BY cnt DESC
        LIMIT 5
      `);
      demandRows = catRows;
    }

    const demandTotal = demandRows.reduce((sum, r) => sum + parseInt(r.cnt), 0) || 1;
    const service_demand = demandRows.map(r => ({
      name: r.name,
      count: parseInt(r.cnt),
      pct: Math.round((parseInt(r.cnt) / demandTotal) * 100)
    }));

    const todayRevVal = parseFloat(todayRev[0].total);
    const yestRevVal = parseFloat(yesterdayRev[0].total);
    const revChange = yestRevVal > 0 ? Math.round(((todayRevVal - yestRevVal) / yestRevVal) * 100) : (todayRevVal > 0 ? 100 : 0);

    res.json({
      success: true,
      data: {
        today_revenue: todayRevVal,
        month_revenue: parseFloat(monthRev[0].total),
        revenue_change: revChange,
        total_purchases_month: parseFloat(purchases[0].total),
        pending_staff_payments: parseFloat(pendingPay[0].total),
        open_job_carts: jobCarts[0].open || 0,
        draft_job_carts: jobCarts[0].draft || 0,
        low_stock_items: lowStock[0].total || 0,
        low_stock_details: lowStockDetails || [],
        totalJobs: jobCarts[0].total || 0,
        completedJobs: jobCarts[0].completed || 0,
        completedLast7Days: recentCompletions[0].total || 0,
        activeDeliveries: activeDeliveries[0].active || 0,
        newLeads: inquiries[0].new_leads || 0,
        todayBookings: todayBookings[0].total || 0,
        totalCustomers: totalCustomers[0].total || 0,
        staffPresent: staffPresent[0].total || 0,
        expiring_packages: expiringPkgs.length,
        expiring_package_details: expiringPkgs,
        pending_service_bookings: pendingBookings[0]?.total || 0,
        pending_package_requests: pendingPackageReqs[0]?.total || 0,
        pending_product_orders: pendingProductOrders[0]?.total || 0,
        total_pending_approvals: (pendingBookings[0]?.total || 0) + (pendingPackageReqs[0]?.total || 0) + (pendingProductOrders[0]?.total || 0),
        weekly_data: weeklyRows.map(r => ({
          day: r.day,
          jobs: parseInt(r.jobs),
          revenue: parseFloat(r.revenue)
        })),
        service_demand,
      }
    });
  } catch (err) {
    console.error('Dashboard Stats error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CUSTOMER DASHBOARD ─────────────────────
// TASK 7: Dashboard query with primary vehicle, active package, remaining services
exports.getCustomerDashboard = async (req, res) => {
  try {
    const customerId = req.user.id;

    const userPkgCtrl = require('./userPackagesController');
    const { checkFirstWashEligibility } = require('../utils/firstWashHelper');

    const [
      [vehicles], [bookings], [loyalty], [recentJobs], [totalVisits],
      packageData, fwCheck
    ] = await Promise.all([
      // My vehicles (ordered by primary first)
      pool.query(`SELECT id, registration_no, brand, model, is_primary FROM vehicles WHERE customer_id = ? ORDER BY is_primary DESC, created_at DESC`, [customerId]),
      // Upcoming bookings
      pool.query(`
        SELECT b.id, b.status, b.vehicle_brand, b.vehicle_model, b.vehicle_reg_no,
               s.slot_date, s.start_time, s.end_time,
               svc.name AS service_name, pkg.name AS package_name
        FROM bookings b
        JOIN slots s ON b.slot_id = s.id
        LEFT JOIN services svc ON b.service_id = svc.id
        LEFT JOIN packages pkg ON b.package_id = pkg.id
        WHERE b.customer_id = ? AND b.status = 'confirmed' AND s.slot_date >= CURDATE()
        ORDER BY s.slot_date ASC, s.start_time ASC
        LIMIT 3
      `, [customerId]),
      // Loyalty
      pool.query(`SELECT credits, free_washes, wax_count FROM loyalty WHERE customer_id = ?`, [customerId]),
      // Recent completed jobs
      pool.query(`
        SELECT jc.id, jc.visit_date, jc.visit_number, jc.status, jc.invoice_number,
               v.registration_no, v.brand, v.model,
               (SELECT GROUP_CONCAT(js.service_name SEPARATOR ', ')
                FROM job_services js WHERE js.job_cart_id = jc.id) AS services_done
        FROM job_carts jc
        JOIN vehicles v ON jc.vehicle_id = v.id
        WHERE v.customer_id = ?
        ORDER BY jc.created_at DESC
        LIMIT 5
      `, [customerId]),
      // Total visit count
      pool.query(`
        SELECT COUNT(*) AS total FROM job_carts jc
        JOIN vehicles v ON jc.vehicle_id = v.id
        WHERE v.customer_id = ? AND jc.status = 'complete'
      `, [customerId]),
      // ─── TASK 7: Primary car + active package + remaining services
      userPkgCtrl.getDashboardPackageData(customerId),
      // Check 50% first wash eligibility
      checkFirstWashEligibility(pool, customerId),
    ]);

    res.json({
      success: true,
      data: {
        vehicles: vehicles,
        upcoming_bookings: bookings,
        loyalty: loyalty[0] || { credits: 0, free_washes: 0, wax_count: 0 },
        recent_jobs: recentJobs,
        total_visits: totalVisits[0].total || 0,
        // ─── Task 7 data ────────────────────────────────────
        primary_car: packageData.primary_car,
        active_package: packageData.active_package,
        first_wash_eligible: fwCheck.isEligible,
      }
    });
  } catch (err) {
    console.error('Customer Dashboard error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
