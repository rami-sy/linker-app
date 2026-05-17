/**
 * ✅ Error Message Security Utility
 * Sanitization للـ error messages + logging منفصل للـ detailed errors
 */

const logger = require('./logger');

/**
 * ✅ Sensitive patterns to remove from error messages
 */
const SENSITIVE_PATTERNS = [
  /password/gi,
  /token/gi,
  /secret/gi,
  /key/gi,
  /api[_-]?key/gi,
  /authorization/gi,
  /auth/gi,
  /credential/gi,
  /private/gi,
  /mongo[_-]?uri/gi,
  /redis[_-]?url/gi,
  /connection[_-]?string/gi,
  /database[_-]?url/gi,
  /mongodb[:\/\/][^\s]+/gi, // MongoDB connection strings
  /redis[:\/\/][^\s]+/gi, // Redis connection strings
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // Email addresses
  /(\d{1,3}\.){3}\d{1,3}/g, // IP addresses (optional - may want to keep for debugging)
];

/**
 * ✅ Stack trace patterns to remove
 */
const STACK_TRACE_PATTERNS = [
  /at\s+.*\(.*\)/g,
  /at\s+.*:\d+:\d+/g,
  /Error:\s+/g,
];

/**
 * ✅ Sanitize error message for user display
 * يزيل المعلومات الحساسة من error messages
 */
const sanitizeErrorMessage = (error, options = {}) => {
  const {
    includeStack = false,
    includeDetails = false,
    logOriginal = true,
  } = options;

  if (!error) {
    return 'An error occurred';
  }

  // ✅ Convert error to string if it's an object
  let errorMessage = typeof error === 'string' ? error : error.message || String(error);
  const originalMessage = errorMessage;

  // ✅ Remove sensitive patterns
  SENSITIVE_PATTERNS.forEach(pattern => {
    errorMessage = errorMessage.replace(pattern, '[REDACTED]');
  });

  // ✅ Remove stack traces unless explicitly requested
  if (!includeStack) {
    STACK_TRACE_PATTERNS.forEach(pattern => {
      errorMessage = errorMessage.replace(pattern, '');
    });
  }

  // ✅ Remove file paths
  errorMessage = errorMessage.replace(/\/[^\s]+/g, '[PATH]');
  errorMessage = errorMessage.replace(/\\[^\s]+/g, '[PATH]');

  // ✅ Remove line numbers
  errorMessage = errorMessage.replace(/:\d+:\d+/g, '');

  // ✅ Trim and clean
  errorMessage = errorMessage.trim().replace(/\s+/g, ' ');

  // ✅ Log original error (detailed) if requested
  if (logOriginal && originalMessage !== errorMessage) {
    logger.error('Original error (sanitized for user):', {
      original: originalMessage,
      sanitized: errorMessage,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: includeStack ? error.stack : undefined,
      } : error,
    });
  }

  // ✅ Return sanitized message
  return errorMessage || 'An error occurred';
};

/**
 * ✅ Get user-friendly error message
 * يعيد رسالة خطأ آمنة للمستخدم
 */
const getUserFriendlyError = (error, context = {}) => {
  const sanitized = sanitizeErrorMessage(error, {
    includeStack: false,
    includeDetails: false,
    logOriginal: true,
  });

  // ✅ Map common errors to user-friendly messages
  const errorMappings = {
    'ECONNREFUSED': 'Connection refused. Please check your network connection.',
    'ETIMEDOUT': 'Connection timeout. Please try again.',
    'ENOTFOUND': 'Network error. Please check your internet connection.',
    'EAI_AGAIN': 'DNS lookup failed. Please check your internet connection.',
    'ValidationError': 'Invalid data provided. Please check your input.',
    'CastError': 'Invalid data format.',
    'MongoError': 'Database error. Please try again later.',
    'MongoNetworkError': 'Database connection error. Please try again later.',
    'RedisError': 'Cache service error. Please try again later.',
    'UnauthorizedError': 'You are not authorized to perform this action.',
    'ForbiddenError': 'Access denied.',
    'NotFoundError': 'Resource not found.',
    'RateLimitError': 'Too many requests. Please slow down.',
  };

  // ✅ Check if error matches any known pattern
  const errorName = error?.name || error?.code || '';
  const errorCode = error?.code || '';
  
  for (const [key, message] of Object.entries(errorMappings)) {
    if (errorName.includes(key) || errorCode.includes(key) || sanitized.includes(key)) {
      return {
        message,
        sanitized,
        category: 'known',
        original: error,
      };
    }
  }

  // ✅ Default user-friendly message
  return {
    message: sanitized || 'An unexpected error occurred. Please try again.',
    sanitized,
    category: 'unknown',
    original: error,
  };
};

/**
 * ✅ Log detailed error (for debugging)
 * يسجل الخطأ بالتفصيل للـ debugging (لا يتم إرساله للمستخدم)
 */
const logDetailedError = (error, context = {}) => {
  const {
    operation,
    userId,
    socketId,
    roomId,
    additionalData = {},
  } = context;

  logger.error('Detailed error (not sent to user):', {
    error: {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
      errno: error?.errno,
      syscall: error?.syscall,
    },
    context: {
      operation,
      userId,
      socketId,
      roomId,
      ...additionalData,
    },
    timestamp: new Date().toISOString(),
  });
};

/**
 * ✅ Format error for callback/response
 * تنسيق الخطأ للإرسال للعميل
 */
const formatErrorForResponse = (error, context = {}) => {
  const {
    includeDetails = false,
    logDetails = true,
  } = context;

  // ✅ Log detailed error (server-side only)
  if (logDetails) {
    logDetailedError(error, context);
  }

  // ✅ Get user-friendly error
  const friendlyError = getUserFriendlyError(error, context);

  // ✅ Build response
  const response = {
    success: false,
    error: friendlyError.message,
    type: 'error',
  };

  // ✅ Add sanitized details if requested (for debugging in development)
  if (includeDetails && process.env.NODE_ENV === 'development') {
    response.sanitizedDetails = friendlyError.sanitized;
  }

  return response;
};

module.exports = {
  sanitizeErrorMessage,
  getUserFriendlyError,
  logDetailedError,
  formatErrorForResponse,
  SENSITIVE_PATTERNS,
  STACK_TRACE_PATTERNS,
};

