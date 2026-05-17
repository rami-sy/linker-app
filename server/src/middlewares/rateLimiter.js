const rateLimit = require('express-rate-limit');
require('dotenv').config();

// General API rate limiting
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // limit each IP to 100 requests per windowMs
  message: {
    message: 'Too many requests from this IP, please try again later.',
    type: 'error'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    res.status(429).json({
      message: 'Too many requests from this IP, please try again later.',
      type: 'error',
      retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    });
  }
});

// Call-specific rate limiting (more restrictive)
const callLimiter = rateLimit({
  windowMs: parseInt(process.env.CALL_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.CALL_RATE_LIMIT_MAX) || 10, // limit each IP to 10 calls per windowMs
  message: {
    message: 'Too many call attempts, please try again later.',
    type: 'error'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message: 'Too many call attempts, please try again later.',
      type: 'error',
      retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    });
  },
  // Skip rate limiting for successful calls
  skip: (req, res) => {
    return res.statusCode < 400;
  }
});

// Auth-specific rate limiting (tune via AUTH_RATE_LIMIT_MAX — default less harsh for dev)
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 30,
  message: {
    message: 'Too many authentication attempts, please try again later.',
    type: 'error'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message: 'Too many authentication attempts, please try again later.',
      type: 'error',
      retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    });
  }
});

// Password reset rate limiting
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // limit each IP to 3 password reset attempts per hour
  message: {
    message: 'Too many password reset attempts, please try again later.',
    type: 'error'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      message: 'Too many password reset attempts, please try again later.',
      type: 'error',
      retryAfter: Math.round(req.rateLimit.resetTime / 1000)
    });
  }
});

module.exports = {
  generalLimiter,
  callLimiter,
  authLimiter,
  passwordResetLimiter
};
