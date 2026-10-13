const rateLimit = require('express-rate-limit');

/**
 * Standard API rate limiter:
 * 300 requests per minute per IP for general REST endpoints
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP. Please slow down and try again in a moment.'
  }
});

/**
 * Strict Auth rate limiter:
 * 20 attempts per 15 minutes per IP to mitigate brute force credential stuffing
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again after 15 minutes.'
  }
});

/**
 * Notification / WhatsApp rate limiter:
 * 60 actions per minute per IP to avoid outbound spam / vendor bans
 */
const notificationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
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
