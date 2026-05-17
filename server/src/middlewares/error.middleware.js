/**
 * ✅ Enhanced Error Handler
 * مع sanitization للأمان
 */
const { formatErrorForResponse } = require('../utils/errorSanitizer');
const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  const statusCode =
    err?.statusCode ||
    err?.status ||
    (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);

  // ✅ Log detailed error (server-side only)
  logger.error('Express error handler:', {
    error: {
      name: err?.name,
      message: err?.message,
      stack: err?.stack,
      code: err?.code,
    },
    request: {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userId: req.user?._id,
      requestId: req.requestId,
    },
  });

  // ✅ Format error for response (sanitized)
  const errorResponse = formatErrorForResponse(err, {
    operation: `${req.method} ${req.path}`,
    userId: req.user?._id?.toString(),
    includeDetails: process.env.NODE_ENV === 'development',
    logDetails: false, // Already logged above
  });

  res.status(statusCode);
  res.json({
    ...errorResponse,
    statusCode,
    requestId: req.requestId,
    ...(process.env.NODE_ENV === 'development' ? {
      stack: err.stack,
    } : {}),
  });
};

module.exports = {
  errorHandler,
};
