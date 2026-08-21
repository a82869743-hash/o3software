const pool = require('../config/db');

/**
 * Checks if a customer is eligible for the 50% First-Wash discount.
 * Rules:
 * 1. Customer user row has has_used_first_wash_discount == 1 -> NOT eligible.
 * 2. Customer has completed prior bookings or quick washes -> NOT eligible.
 * 3. Customer has any previous booking with discount_percent > 0 -> NOT eligible.
 */
async function checkFirstWashEligibility(dbConnOrPool, customerId) {
  if (!customerId) return { isEligible: false, reason: 'No customer ID' };

  const executor = dbConnOrPool || pool;

  // 1. Check user row flag
  const [userRows] = await executor.query(
    'SELECT has_used_first_wash_discount FROM users WHERE id = ?',
    [customerId]
  );
  if (userRows.length && userRows[0].has_used_first_wash_discount == 1) {
    return { isEligible: false, reason: 'First wash discount already used' };
  }

  // 2. Count completed bookings/washes
  const [bookingRows] = await executor.query(
    "SELECT COUNT(*) AS total FROM bookings WHERE customer_id = ? AND (status = 'completed' OR wash_status = 'completed')",
    [customerId]
  );
  if (bookingRows[0].total > 0) {
    return { isEligible: false, reason: 'Customer has completed prior washes' };
  }

  // 3. Check for any booking already holding a discount_percent > 0
  const [discRows] = await executor.query(
    "SELECT COUNT(*) AS total FROM bookings WHERE customer_id = ? AND discount_percent > 0",
    [customerId]
  );
  if (discRows[0].total > 0) {
    return { isEligible: false, reason: 'Discount already assigned on a booking' };
  }

  return { isEligible: true };
}

/**
 * Marks first wash discount as used for customer.
 */
async function markFirstWashDiscountUsed(dbConnOrPool, customerId) {
  if (!customerId) return;
  const executor = dbConnOrPool || pool;
  await executor.query(
    'UPDATE users SET has_used_first_wash_discount = 1 WHERE id = ?',
    [customerId]
  );
}

module.exports = {
  checkFirstWashEligibility,
  markFirstWashDiscountUsed
};
