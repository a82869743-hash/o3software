const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const jwt = require('jsonwebtoken');

// Count per logged-in person (the whole studio shares one Wi-Fi IP); people not logged in count per IP
const userOrIpKey = (req) => {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) {
    try {
      const d = jwt.verify(h.slice(7), process.env.JWT_SECRET);
      if (d && d.id) return `u:${d.id}`;
    } catch { /* bad or expired token: fall back to IP */ }
  }
  return `ip:${ipKeyGenerator(req.ip || '')}`;
};

/**
 * Standard API rate limiter:
 * 300 requests per minute per logged-in user (per IP when not logged in)
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  keyGenerator: userOrIpKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. Please slow down and try again in a moment.'
  }
});

/**
 * Strict Auth rate limiter:
 * 20 attempts per 15 minutes per IP to mitigate brute force credential stuffing
 */
// Sign-in tries are counted per mobile number + IP, so one person's wrong passwords do not lock out
// everyone on the studio Wi-Fi. A looser per-IP cap still stops one device trying many numbers.
const mobileKey = (req) => String(req.body?.mobile || req.body?.phone || '').replace(/\D/g, '').slice(-10);
const authPerMobile = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skip: () => process.env.NODE_ENV === 'test',
  skipSuccessfulRequests: true, // only wrong passwords / codes count towards the limit
  keyGenerator: (req) => `${ipKeyGenerator(req.ip || '')}|${mobileKey(req) || '-'}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many tries for this number. Please try again after 15 minutes.'
  }
});
const authPerIp = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  skip: () => process.env.NODE_ENV === 'test',
  skipSuccessfulRequests: true,
  keyGenerator: (req) => ipKeyGenerator(req.ip || ''),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many authentication attempts from this network. Please try again after 15 minutes.'
  }
});
const authLimiter = (req, res, next) => authPerIp(req, res, (err) => (err ? next(err) : authPerMobile(req, res, next)));

/**
 * Notification / WhatsApp rate limiter:
 * 60 actions per minute per IP to avoid outbound spam / vendor bans
 */
const notificationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  // Only sends count. Reads (link status polled every 3 s, inbox, logs) from several studio screens
  // on one Wi-Fi address used to use up the limit and break the WhatsApp page.
  skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
  message: {
    success: false,
    error: 'Notification throughput limit exceeded. Please wait a minute before sending more.'
  }
});

module.exports = {
  apiLimiter,
  authLimiter,
  notificationLimiter
};
