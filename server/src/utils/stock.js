/**
 * Stock guard used before anything leaves the inventory (sale, bill, order, transfer).
 * Returns an error message when there is not enough stock, otherwise null.
 */
async function stockError(db, productId, qty) {
  if (!productId) return null;
  const [[item]] = await db.query('SELECT product_name, quantity FROM inventory WHERE id = ? AND (is_deleted = 0 OR is_deleted IS NULL)', [productId]);
  if (!item) return 'Product not found';
  const have = Number(item.quantity) || 0;
  if (have <= 0) return `${item.product_name}: 0 stock left — kindly reorder from main admin`;
  if (have < Number(qty || 1)) return `${item.product_name}: only ${have} left in stock`;
  return null;
}
module.exports = { stockError };
