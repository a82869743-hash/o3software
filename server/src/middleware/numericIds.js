// Ids in the URL must be whole numbers. Anything else ("abc", "1;drop") gets a clean 404
// instead of reaching the database and failing with a server error.
module.exports = function numericIds(router, names = ['id']) {
  for (const name of names) {
    router.param(name, (req, res, next, value) =>
      (/^\d+$/.test(String(value)) ? next() : res.status(404).json({ success: false, error: 'Not found' })));
  }
  return router;
};
