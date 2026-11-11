/**
 * Studio (franchise) scope for SQL: `scopeOf(req).and('jc.franchise_id')` → " AND jc.franchise_id = 2",
 * or "" when the Super Admin is viewing all studios. The id is a number from the login, never user text,
 * so it is safe to put in the SQL directly (keeps each query's ? params in the same order).
 */
function scopeOf(req) {
  const all = !!req.isGlobalAdmin;
  const fid = Number(req.franchiseId) || Number(req.user?.franchise_id) || 1;
  return {
    all,
    fid,
    and: (col = 'franchise_id') => (all ? '' : ` AND ${col} = ${fid}`),
    where: (col = 'franchise_id') => (all ? ' WHERE 1=1' : ` WHERE ${col} = ${fid}`),
  };
}

module.exports = { scopeOf };
