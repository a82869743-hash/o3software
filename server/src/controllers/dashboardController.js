const pool = require('../config/db');

// ─── ADMIN STATS ────────────────────────────
exports.getStats = async (req, res) => {
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const monthStart = today.slice(0, 8) + '01';

    // Timeframe filter: 'today' | 'weekly' | 'monthly' | 'yearly' | 'all_time'
    const timeframe = req.query.timeframe || req.query.period || 'today';
    
    // Franchise filter: 'all' (Consolidated Super Admin) or numeric franchise id
    const requestedFranchise = req.query.franchise_id || req.headers['x-franchise-id'];
    const isConsolidated = requestedFranchise === 'all' || requestedFranchise === 'consolidated' || req.isGlobalAdmin;
    const franchiseId = isConsolidated ? null : (requestedFranchise ? parseInt(requestedFranchise, 10) : 1);

    // ─── Date Range Condition Builder ───────────
    let dateCondTrans = 'DATE(transactions.transaction_date) = CURDATE()';
    let dateCondJC = 'DATE(COALESCE(job_carts.completed_at, job_carts.visit_date)) = CURDATE()';
    let dateCondJCJoined = 'DATE(COALESCE(jc.completed_at, jc.visit_date)) = CURDATE()';

    switch (timeframe) {
      case 'weekly':
      case 'week':
        dateCondTrans = 'DATE(transactions.transaction_date) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)';
        dateCondJC = 'DATE(COALESCE(job_carts.completed_at, job_carts.visit_date)) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)';
        dateCondJCJoined = 'DATE(COALESCE(jc.completed_at, jc.visit_date)) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)';
        break;
      case 'monthly':
      case 'month':
        dateCondTrans = "DATE(transactions.transaction_date) >= DATE_FORMAT(CURDATE(), '%Y-%m-01')";
        dateCondJC = "DATE(COALESCE(job_carts.completed_at, job_carts.visit_date)) >= DATE_FORMAT(CURDATE(), '%Y-%m-01')";
        dateCondJCJoined = "DATE(COALESCE(jc.completed_at, jc.visit_date)) >= DATE_FORMAT(CURDATE(), '%Y-%m-01')";
        break;
      case 'yearly':
      case 'year':
        dateCondTrans = "DATE(transactions.transaction_date) >= DATE_FORMAT(CURDATE(), '%Y-01-01')";
        dateCondJC = "DATE(COALESCE(job_carts.completed_at, job_carts.visit_date)) >= DATE_FORMAT(CURDATE(), '%Y-01-01')";
        dateCondJCJoined = "DATE(COALESCE(jc.completed_at, jc.visit_date)) >= DATE_FORMAT(CURDATE(), '%Y-01-01')";
        break;
      case 'all_time':
      case 'all':
        dateCondTrans = '1=1';
        dateCondJC = '1=1';
        dateCondJCJoined = '1=1';
        break;
      case 'today':
      default:
        dateCondTrans = 'DATE(transactions.transaction_date) = CURDATE()';
        dateCondJC = 'DATE(COALESCE(job_carts.completed_at, job_carts.visit_date)) = CURDATE()';
        dateCondJCJoined = 'DATE(COALESCE(jc.completed_at, jc.visit_date)) = CURDATE()';
        break;
    }

    // ─── Franchise SQL Filter Builder with explicit table prefixes ───
    const fCondTrans = isConsolidated ? '1=1' : '(transactions.franchise_id = ? OR (transactions.franchise_id IS NULL AND ? = 1))';
    const fCondJC = isConsolidated ? '1=1' : '(job_carts.franchise_id = ? OR (job_carts.franchise_id IS NULL AND ? = 1))';
    const fCondJCJoined = isConsolidated ? '1=1' : '(jc.franchise_id = ? OR (jc.franchise_id IS NULL AND ? = 1))';
    const fCondInv = isConsolidated ? '1=1' : '(i.franchise_id = ? OR (i.franchise_id IS NULL AND ? = 1))';
    const fCondBook = isConsolidated ? '1=1' : '(b.franchise_id = ? OR (b.franchise_id IS NULL AND ? = 1))';
    const fCondInq = isConsolidated ? '1=1' : '(inquiries.franchise_id = ? OR (inquiries.franchise_id IS NULL AND ? = 1))';
    const fCondPkg = isConsolidated ? '1=1' : '(up.franchise_id = ? OR (up.franchise_id IS NULL AND ? = 1))';
    const fCondUser = isConsolidated ? '1=1' : '(u.franchise_id = ? OR (u.franchise_id IS NULL AND ? = 1))';

    const fParams = isConsolidated ? [] : [franchiseId, franchiseId];

    // Run core and aggregated indexed queries in parallel for sub-100ms response time
    const [
      // 1. Timeframe Revenue (Aggregated & Indexed)
      [timeframeRev],
      // 2. Timeframe Cars Serviced (Aggregated & Indexed)
      [timeframeCars],
      // 3. Timeframe Pending Payments
      [timeframePending],
      // 4. Timeframe Top Services
      [topServicesRows],
      // 5. Staff Performance Leaderboard
      [staffRows],
      // 6. Super Admin Consolidated Franchise Breakdown
      [franchiseRows],
      // Standard widgets & counters
      [todayRev], [monthRev], [yesterdayRev],
      [jobCarts], [activeDeliveries], [inquiries],
      [purchases], [pendingPay], [lowStock], [lowStockDetails],
      [todayBookings], [totalCustomers], [recentCompletions],
      [staffPresent], [expiringPkgs],
      [pendingBookings], [pendingPackageReqs], [pendingProductOrders]
    ] = await Promise.all([
      // 1. Filtered revenue
      pool.query(
        `SELECT COALESCE(SUM(transactions.amount), 0) AS total FROM transactions
         WHERE transactions.direction = 'in' AND ${dateCondTrans} AND ${fCondTrans}`,
        fParams
      ),
      // 2. Filtered completed cars serviced
      pool.query(
        `SELECT COUNT(*) AS total FROM job_carts
         WHERE job_carts.status = 'complete' AND ${dateCondJC} AND ${fCondJC}`,
        fParams
      ),
      // 3. Pending customer payments (balance_due > 0)
      pool.query(
        `SELECT COALESCE(SUM(job_carts.balance_due), 0) AS total FROM job_carts
         WHERE job_carts.balance_due > 0 AND ${fCondJC}`,
        fParams
      ),
      // 4. Top services performed in timeframe
      pool.query(
        `SELECT js.service_name AS name, COUNT(*) AS count, COALESCE(SUM(js.service_price), 0) AS revenue
         FROM job_services js
         JOIN job_carts jc ON js.job_cart_id = jc.id
         WHERE jc.status = 'complete' AND ${dateCondJCJoined} AND ${fCondJCJoined}
         GROUP BY js.service_name
         ORDER BY count DESC, revenue DESC
         LIMIT 5`,
        fParams
      ),
      // 5. Staff Performance Leaderboard (filtered by timeframe)
      pool.query(
        `SELECT 
           u.id AS staff_id,
           u.name AS staff_name,
           u.role,
           u.mobile,
           COUNT(DISTINCT CASE WHEN jc.status = 'complete' AND ${dateCondJCJoined} THEN jc.id END) AS completed_jobs,
           COALESCE(SUM(CASE WHEN jc.status = 'complete' AND ${dateCondJCJoined} THEN jc.total_amount ELSE 0 END), 0) AS total_revenue,
           COALESCE((
             SELECT SUM(amount) FROM incentive_splits inc 
             WHERE inc.user_id = u.id AND inc.status IN ('approved', 'paid')
           ), 0) AS incentives_earned
         FROM users u
         LEFT JOIN job_carts jc ON (jc.technician_id = u.id OR jc.created_by = u.id)
         WHERE u.role IN ('staff', 'admin') AND u.is_active = 1 AND ${fCondUser}
         GROUP BY u.id, u.name, u.role, u.mobile
         ORDER BY completed_jobs DESC, total_revenue DESC
         LIMIT 10`,
        fParams
      ),
      // 6. Super Admin Consolidated Franchise Breakdown across all active franchises
      pool.query(
        `SELECT 
           f.id, f.name, f.code, f.city,
           COALESCE((SELECT SUM(amount) FROM transactions WHERE direction = 'in' AND (franchise_id = f.id OR (franchise_id IS NULL AND f.id = 1)) AND ${dateCondTrans}), 0) AS revenue,
           COALESCE((SELECT COUNT(*) FROM job_carts WHERE status = 'complete' AND (franchise_id = f.id OR (franchise_id IS NULL AND f.id = 1)) AND ${dateCondJC}), 0) AS cars_serviced,
           COALESCE((SELECT SUM(balance_due) FROM job_carts WHERE balance_due > 0 AND (franchise_id = f.id OR (franchise_id IS NULL AND f.id = 1))), 0) AS pending_payments,
           COALESCE((SELECT COUNT(*) FROM job_carts WHERE status IN ('open', 'in_progress') AND (franchise_id = f.id OR (franchise_id IS NULL AND f.id = 1))), 0) AS active_jobs
         FROM franchises f
         WHERE f.is_active = 1
         ORDER BY f.id ASC`
      ),
      // Today revenue
      pool.query(
        `SELECT COALESCE(SUM(transactions.amount), 0) AS total FROM transactions
         WHERE transactions.direction = 'in' AND DATE(transactions.transaction_date) = ? AND ${fCondTrans}`,
        isConsolidated ? [today] : [today, franchiseId, franchiseId]
      ),
      // Month revenue
      pool.query(
        `SELECT COALESCE(SUM(transactions.amount), 0) AS total FROM transactions
         WHERE transactions.direction = 'in' AND DATE(transactions.transaction_date) >= ? AND DATE(transactions.transaction_date) <= ? AND ${fCondTrans}`,
        isConsolidated ? [monthStart, today] : [monthStart, today, franchiseId, franchiseId]
      ),
      // Yesterday revenue for comparison
      pool.query(
        `SELECT COALESCE(SUM(transactions.amount), 0) AS total FROM transactions
         WHERE transactions.direction = 'in' AND DATE(transactions.transaction_date) = DATE_SUB(?, INTERVAL 1 DAY) AND ${fCondTrans}`,
        isConsolidated ? [today] : [today, franchiseId, franchiseId]
      ),
      // Job carts breakdown
      pool.query(`SELECT 
        COUNT(*) as total, 
        SUM(IF(job_carts.status='complete', 1, 0)) as completed, 
        SUM(IF(job_carts.status='open', 1, 0)) as open,
        SUM(IF(job_carts.status='draft', 1, 0)) as draft
        FROM job_carts
        WHERE ${fCondJC}`, fParams),
      // Deliveries
      pool.query(`SELECT COUNT(*) as active FROM deliveries WHERE status='in_transit'`),
      // Inquiries
      pool.query(`SELECT COUNT(*) as new_leads FROM inquiries WHERE inquiries.status='new' AND ${fCondInq}`, fParams),
      // Purchases
      pool.query(
        `SELECT COALESCE(SUM(transactions.amount), 0) AS total FROM transactions
         WHERE transactions.direction = 'out' AND transactions.type = 'purchase'
         AND DATE(transactions.transaction_date) >= ? AND DATE(transactions.transaction_date) <= ? AND ${fCondTrans}`,
        isConsolidated ? [monthStart, today] : [monthStart, today, franchiseId, franchiseId]
      ),
      // Pending staff payments
      pool.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM staff_payments WHERE status = 'pending'`),
      // Low stock count
      pool.query(`SELECT COUNT(*) AS total FROM inventory i WHERE i.quantity <= i.low_stock_threshold AND i.is_deleted = 0 AND ${fCondInv}`, fParams),
      // Low stock details array per franchise
      pool.query(
        `SELECT i.id, i.product_name, i.unit, i.quantity, i.low_stock_threshold, i.category,
                COALESCE(i.franchise_price, i.selling_price, 0) AS unit_price,
                i.franchise_id, f.name AS franchise_name, f.code AS franchise_code
         FROM inventory i
         LEFT JOIN franchises f ON i.franchise_id = f.id
         WHERE i.quantity <= i.low_stock_threshold AND i.is_deleted = 0
           AND ${fCondInv}
         ORDER BY i.quantity ASC
         LIMIT 10`, fParams
      ),
      // Today's bookings count
      pool.query(
        `SELECT COUNT(*) AS total FROM bookings b 
         JOIN slots s ON b.slot_id = s.id 
         WHERE s.slot_date = ? AND b.status = 'confirmed' AND ${fCondBook}`,
        isConsolidated ? [today] : [today, franchiseId, franchiseId]
      ),
      // Total customers
      pool.query(`SELECT COUNT(*) AS total FROM users WHERE role = 'customer' AND is_active = 1`),
      // Completed in last 7 days
      pool.query(
        `SELECT COUNT(*) AS total FROM job_carts 
         WHERE job_carts.status = 'complete' AND job_carts.completed_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND ${fCondJC}`,
        fParams
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
           AND ${fCondPkg}
         ORDER BY up.end_date ASC`, fParams
      ),
      // Pending Approvals Queries
      pool.query(`SELECT COUNT(*) AS total FROM bookings b WHERE b.status = 'pending_approval' AND ${fCondBook}`, fParams),
      pool.query(`SELECT COUNT(*) AS total FROM package_requests WHERE status = 'pending'`),
      pool.query(`SELECT COUNT(*) AS total FROM product_orders WHERE payment_status = 'pending'`),
    ]);

    // Weekly trend data (last 7 days revenue + job count per day)
    const [weeklyRows] = await pool.query(`
      SELECT 
        DATE_FORMAT(jc.visit_date, '%a') AS day,
        DATE(jc.visit_date) AS date_val,
        COUNT(jc.id) AS jobs,
        COALESCE(SUM(t.amount), 0) AS revenue
      FROM job_carts jc
      LEFT JOIN transactions t ON t.type = 'job_revenue' AND t.reference_id = jc.id AND t.direction = 'in'
      WHERE jc.visit_date >= CURDATE() - INTERVAL 6 DAY AND ${fCondJCJoined}
      GROUP BY DATE(jc.visit_date), DATE_FORMAT(jc.visit_date, '%a')
      ORDER BY date_val ASC
    `, fParams);

    // Format top services (with fallback to all-time if current timeframe is empty)
    let finalTopServices = topServicesRows;
    if (!finalTopServices || finalTopServices.length === 0) {
      const [allTimeServices] = await pool.query(
        `SELECT js.service_name AS name, COUNT(*) AS count, COALESCE(SUM(js.service_price), 0) AS revenue
         FROM job_services js
         JOIN job_carts jc ON js.job_cart_id = jc.id
         WHERE ${fCondJCJoined}
         GROUP BY js.service_name
         ORDER BY count DESC, revenue DESC
         LIMIT 5`,
        fParams
      );
      finalTopServices = allTimeServices;
    }

    const topServicesTotalCount = finalTopServices.reduce((sum, r) => sum + parseInt(r.count || 0), 0) || 1;
    const formattedTopServices = finalTopServices.map(r => ({
      name: r.name,
      count: parseInt(r.count || 0),
      revenue: parseFloat(r.revenue || 0),
      pct: Math.round((parseInt(r.count || 0) / topServicesTotalCount) * 100)
    }));

    // Format service demand share (maintains backward compatibility with charts)
    const service_demand = formattedTopServices.map(s => ({
      name: s.name,
      count: s.count,
      pct: s.pct
    }));

    const timeframeRevVal = parseFloat(timeframeRev[0]?.total || 0);
    const todayRevVal = parseFloat(todayRev[0]?.total || 0);
    const yestRevVal = parseFloat(yesterdayRev[0]?.total || 0);
    const revChange = yestRevVal > 0 ? Math.round(((todayRevVal - yestRevVal) / yestRevVal) * 100) : (todayRevVal > 0 ? 100 : 0);

    const timeframeLabelMap = {
      today: 'Today',
      weekly: 'This Week',
      week: 'This Week',
      monthly: 'This Month',
      month: 'This Month',
      yearly: 'This Year',
      year: 'This Year',
      all_time: 'All-Time',
      all: 'All-Time',
    };

    res.json({
      success: true,
      data: {
        // ─── Phase 6 Studio Dashboard Primary Metrics ───
        timeframe,
        timeframe_label: timeframeLabelMap[timeframe] || 'Today',
        is_consolidated: isConsolidated,
        selected_franchise_id: isConsolidated ? 'all' : (franchiseId || 1),

        // Primary 5 metrics requested in prompt
        revenue: timeframeRevVal,
        cars_serviced: parseInt(timeframeCars[0]?.total || 0),
        pending_payments: parseFloat(timeframePending[0]?.total || 0),
        top_services: formattedTopServices,
        staff_performance: staffRows.map(s => ({
          staff_id: s.staff_id,
          staff_name: s.staff_name,
          role: s.role,
          mobile: s.mobile,
          completed_jobs: parseInt(s.completed_jobs || 0),
          total_revenue: parseFloat(s.total_revenue || 0),
          incentives_earned: parseFloat(s.incentives_earned || 0)
        })),

        // ─── Super Admin Consolidated Franchise Breakdown ───
        franchise_breakdown: franchiseRows.map(f => ({
          id: f.id,
          name: f.name,
          code: f.code,
          city: f.city,
          revenue: parseFloat(f.revenue || 0),
          cars_serviced: parseInt(f.cars_serviced || 0),
          pending_payments: parseFloat(f.pending_payments || 0),
          active_jobs: parseInt(f.active_jobs || 0)
        })),

        // ─── Legacy & Widget Compatibility ───────────
        today_revenue: todayRevVal,
        month_revenue: parseFloat(monthRev[0]?.total || 0),
        revenue_change: revChange,
        total_purchases_month: parseFloat(purchases[0]?.total || 0),
        pending_staff_payments: parseFloat(pendingPay[0]?.total || 0),
        open_job_carts: jobCarts[0]?.open || 0,
        draft_job_carts: jobCarts[0]?.draft || 0,
        low_stock_items: lowStock[0]?.total || 0,
        low_stock_details: lowStockDetails || [],
        totalJobs: jobCarts[0]?.total || 0,
        completedJobs: jobCarts[0]?.completed || 0,
        completedLast7Days: recentCompletions[0]?.total || 0,
        activeDeliveries: activeDeliveries[0]?.active || 0,
        newLeads: inquiries[0]?.new_leads || 0,
        todayBookings: todayBookings[0]?.total || 0,
        totalCustomers: totalCustomers[0]?.total || 0,
        staffPresent: staffPresent[0]?.total || 0,
        expiring_packages: expiringPkgs.length,
        expiring_package_details: expiringPkgs,
        pending_service_bookings: pendingBookings[0]?.total || 0,
        pending_package_requests: pendingPackageReqs[0]?.total || 0,
        pending_product_orders: pendingProductOrders[0]?.total || 0,
        total_pending_approvals: (pendingBookings[0]?.total || 0) + (pendingPackageReqs[0]?.total || 0) + (pendingProductOrders[0]?.total || 0),
        weekly_data: weeklyRows.map(r => ({
          day: r.day,
          jobs: parseInt(r.jobs || 0),
          revenue: parseFloat(r.revenue || 0)
        })),
        service_demand,
      }
    });
  } catch (err) {
    console.error('Dashboard Stats error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard statistics',
      details: err.message
    });
  }
};

// ─── CUSTOMER DASHBOARD ─────────────────────
// TASK 7 & Phase 6: Dashboard query with primary vehicle, active package, remaining services, and live yearly cars counter
exports.getCustomerDashboard = async (req, res) => {
  try {
    const customerId = req.user.id;

    const userPkgCtrl = require('./userPackagesController');
    const { checkFirstWashEligibility } = require('../utils/firstWashHelper');

    const [
      [vehicles], [bookings], [loyalty], [recentJobs], [totalVisits],
      packageData, fwCheck,
      [carsServicedYear]
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
      // Primary car + active package + remaining services
      userPkgCtrl.getDashboardPackageData(customerId),
      // Check 50% first wash eligibility
      checkFirstWashEligibility(pool, customerId),
      // Total cars serviced this year across studio (Live customer counter)
      pool.query("SELECT COUNT(*) AS total FROM job_carts WHERE status = 'complete' AND YEAR(COALESCE(completed_at, visit_date)) = YEAR(CURDATE())"),
    ]);

    const carsServicedCount = parseInt(carsServicedYear[0]?.total || 0, 10);

    res.json({
      success: true,
      data: {
        vehicles: vehicles,
        upcoming_bookings: bookings,
        loyalty: loyalty[0] || { credits: 0, free_washes: 0, wax_count: 0 },
        recent_jobs: recentJobs,
        total_visits: totalVisits[0]?.total || 0,
        cars_serviced_this_year: carsServicedCount,
        // Primary vehicle & package data
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
