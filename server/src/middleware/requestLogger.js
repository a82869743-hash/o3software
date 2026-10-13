/**
 * requestLogger.js — Production Structured JSON Request Logger & PII Redactor
 */

const crypto = require('crypto');

function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10) {
    const start = digits.slice(0, 2);
    const end = digits.slice(-3);
    return `+91 ${start}*** **${end}`;
  }
  return '***';
}

function requestLogger(req, res, next) {
  const start = Date.now();
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-ID', req.id);

  // Hook into response finish
  res.on('finish', () => {
    // Skip health checks to keep production logs clean
    if (req.originalUrl === '/api/health' || req.originalUrl === '/api/v1/health') {
      return;
    }

    const durationMs = Date.now() - start;
    const logEntry = {
      timestamp: new Date().toISOString(),
      req_id: req.id,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      duration_ms: durationMs,
      franchise_id: req.franchiseId || req.user?.franchise_id || null,
      user_id: req.user?.id || null,
      ip: req.ip || req.connection?.remoteAddress
    };

    if (process.env.NODE_ENV === 'production') {
      process.stdout.write(JSON.stringify(logEntry) + '\n');
    } else {
      const color = res.statusCode >= 500 ? '\x1b[31m' : res.statusCode >= 400 ? '\x1b[33m' : '\x1b[32m';
      console.log(`[HTTP] ${req.method} ${req.originalUrl} ${color}${res.statusCode}\x1b[0m ${durationMs}ms`);
    }
  });

  next();
}

module.exports = { requestLogger, maskPhone };
