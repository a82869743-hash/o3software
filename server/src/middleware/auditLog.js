const { logAudit } = require('../controllers/auditController');

module.exports = (req, res, next) => {
  // Only log mutations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    // We want to log the event after the response finishes to know if it succeeded
    res.on('finish', () => {
      // Only log successful or client error responses (optional, but usually we want to know what happened)
      // Let's log everything for now, or just success
      if (res.statusCode >= 200 && res.statusCode < 400) {
        const userId = req.user ? req.user.id : null;
        if (!userId) return; // Can't tie to user

        let action = 'update';
        if (req.method === 'POST') action = 'create';
        if (req.method === 'DELETE') action = 'delete';
        
        const entityType = req.baseUrl.split('/').pop() || 'system';
        
        // Try to get entity ID from params or body
        const entityId = req.params.id || req.body.id || null;
        
        const details = {
          url: req.originalUrl,
          status: res.statusCode,
          body: req.method !== 'DELETE' ? req.body : undefined,
          query: req.query
        };

        const ipAddress = req.ip || req.connection.remoteAddress;

        logAudit(userId, action, entityType, entityId, details, ipAddress).catch(err => {
          console.error('Audit middleware error:', err);
        });
      }
    });
  }
  next();
};
