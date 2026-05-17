/**
 * ✅ Standardized Error Handler
 * معالج موحد للأخطاء في جميع أنحاء التطبيق
 * يوفر patterns موحدة لمعالجة الأخطاء
 */

const logger = require('./logger');
const { formatErrorForCallback, formatErrorForResponse } = require('./errorSanitizer');
const { ERROR_CODES, createError } = require('./errorCodes');

/**
 * ✅ Error Handler Class
 * يوفر methods موحدة لمعالجة الأخطاء
 */
class ErrorHandler {
  /**
   * ✅ Handle error in async function
   * معالجة خطأ في async function مع logging و sanitization
   * 
   * @param {Error} error - الخطأ
   * @param {Object} context - Context للـ logging
   * @param {Object} options - Options إضافية
   * @returns {Object} Formatted error response
   */
  static handleAsyncError(error, context = {}, options = {}) {
    const {
      operation = 'Unknown operation',
      userId = null,
      includeDetails = process.env.NODE_ENV === 'development',
      logDetails = true,
      throwError = false,
    } = options;

    // ✅ Log detailed error (server-side only)
    if (logDetails) {
      logger.error(`Error in ${operation}:`, {
        error: {
          name: error?.name,
          message: error?.message,
          stack: error?.stack,
          code: error?.code,
        },
        context: {
          ...context,
          userId: userId?.toString(),
          operation,
        },
      });
    }

    // ✅ Format error for response (sanitized)
    const errorResponse = formatErrorForResponse(error, {
      operation,
      userId: userId?.toString(),
      includeDetails,
      logDetails: false, // Already logged above
    });

    // ✅ Throw error if requested
    if (throwError) {
      const formattedError = createError(
        error?.code || ERROR_CODES.UNKNOWN_ERROR,
        errorResponse.error
      );
      throw formattedError;
    }

    return errorResponse;
  }

  /**
   * ✅ Handle error in socket callback
   * معالجة خطأ في socket callback
   * 
   * @param {Error} error - الخطأ
   * @param {Function} callback - Socket callback function
   * @param {Object} context - Context للـ logging
   */
  static handleSocketError(error, callback, context = {}) {
    const formattedError = formatErrorForCallback(error, context);
    
    logger.error('Socket error:', {
      error: {
        name: error?.name,
        message: error?.message,
        code: error?.code,
      },
      context,
    });

    if (callback && typeof callback === 'function') {
      callback(formattedError);
    }
  }

  /**
   * ✅ Handle error in Express route
   * معالجة خطأ في Express route
   * 
   * @param {Error} error - الخطأ
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next function
   */
  static handleExpressError(error, req, res, next) {
    const statusCode = res.statusCode || 500;

    // ✅ Log detailed error
    logger.error('Express error:', {
      error: {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        code: error?.code,
      },
      request: {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userId: req.user?._id,
      },
    });

    // ✅ Format error for response
    const errorResponse = formatErrorForResponse(error, {
      operation: `${req.method} ${req.path}`,
      userId: req.user?._id?.toString(),
      includeDetails: process.env.NODE_ENV === 'development',
      logDetails: false, // Already logged above
    });

    res.status(statusCode);
    res.json({
      ...errorResponse,
      statusCode,
      ...(process.env.NODE_ENV === 'development' ? {
        stack: error.stack,
      } : {}),
    });
  }

  /**
   * ✅ Wrap async function with error handling
   * لف async function بمعالجة أخطاء موحدة
   * 
   * @param {Function} fn - Async function to wrap
   * @param {Object} options - Options للـ error handling
   * @returns {Function} Wrapped function
   */
  static wrapAsync(fn, options = {}) {
    return async (req, res, next) => {
      try {
        await fn(req, res, next);
      } catch (error) {
        ErrorHandler.handleExpressError(error, req, res, next);
      }
    };
  }

  /**
   * ✅ Handle error with retry
   * معالجة خطأ مع إعادة المحاولة
   * 
   * @param {Function} fn - Function to retry
   * @param {Object} options - Retry options
   * @returns {Promise} Result of function
   */
  static async handleWithRetry(fn, options = {}) {
    const {
      maxRetries = 3,
      initialDelay = 1000,
      backoffMultiplier = 2,
      retryableErrors = [],
    } = options;

    let lastError;
    let delay = initialDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // ✅ Check if error is retryable
        const isRetryable = retryableErrors.length === 0 || 
          retryableErrors.some(pattern => 
            error.message?.includes(pattern) || 
            error.code?.includes(pattern) ||
            error.name?.includes(pattern)
          );

        if (!isRetryable || attempt === maxRetries) {
          logger.error(`Operation failed after ${attempt + 1} attempts:`, error);
          throw error;
        }

        logger.warn(`Operation failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, {
          error: error.message,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          delay,
        });

        // ✅ Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= backoffMultiplier;
      }
    }

    throw lastError;
  }

  /**
   * ✅ Handle error with fallback
   * معالجة خطأ مع fallback value
   * 
   * @param {Function} fn - Function to execute
   * @param {*} fallbackValue - Value to return on error
   * @param {Object} context - Context للـ logging
   * @returns {Promise} Result or fallback value
   */
  static async handleWithFallback(fn, fallbackValue = null, context = {}) {
    try {
      return await fn();
    } catch (error) {
      logger.warn('Operation failed, using fallback value:', {
        error: error.message,
        context,
      });
      return fallbackValue;
    }
  }

  /**
   * ✅ Validate and handle error
   * التحقق من الخطأ ومعالجته
   * 
   * @param {Error} error - الخطأ
   * @param {Object} validationRules - Rules للتحقق
   * @returns {Object} Validation result
   */
  static validateError(error, validationRules = {}) {
    const {
      requiredFields = [],
      allowedCodes = [],
      maxMessageLength = 500,
    } = validationRules;

    // ✅ Check required fields
    for (const field of requiredFields) {
      if (!error[field]) {
        return {
          valid: false,
          reason: `Missing required field: ${field}`,
        };
      }
    }

    // ✅ Check allowed codes
    if (allowedCodes.length > 0 && !allowedCodes.includes(error.code)) {
      return {
        valid: false,
        reason: `Error code not allowed: ${error.code}`,
      };
    }

    // ✅ Check message length
    if (error.message && error.message.length > maxMessageLength) {
      return {
        valid: false,
        reason: `Error message too long: ${error.message.length} > ${maxMessageLength}`,
      };
    }

    return {
      valid: true,
    };
  }
}

module.exports = ErrorHandler;

