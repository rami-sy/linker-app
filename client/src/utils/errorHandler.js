/**
 * ✅ Standardized Error Handler (Client-side)
 * معالج موحد للأخطاء في جميع أنحاء التطبيق (Client)
 * يوفر patterns موحدة لمعالجة الأخطاء
 */

import logger from './logger';
import { normalizeError, createError, ERROR_CODES } from './errorCodes';
import { getUserFriendlyError, getSimpleErrorMessage } from './userFriendlyErrors';

/**
 * ✅ Error Handler Class
 * يوفر methods موحدة لمعالجة الأخطاء
 */
class ErrorHandler {
  /**
   * ✅ Handle error in async function
   * معالجة خطأ في async function مع logging و user-friendly messages
   * 
   * @param {Error} error - الخطأ
   * @param {Object} context - Context للـ logging
   * @param {Object} options - Options إضافية
   * @returns {Object} Formatted error response
   */
  static handleAsyncError(error, context = {}, options = {}) {
    const {
      operation = 'Unknown operation',
      showUserMessage = true,
      logDetails = true,
      throwError = false,
    } = options;

    // ✅ Normalize error
    const normalizedError = normalizeError(error);

    // ✅ Log detailed error (client-side)
    if (logDetails) {
      logger.error(`Error in ${operation}:`, {
        error: {
          name: error?.name,
          message: error?.message,
          code: normalizedError.code,
          category: normalizedError.category,
        },
        context,
      });
    }

    // ✅ Get user-friendly error message
    const userFriendlyError = getUserFriendlyError(error);

    const errorResponse = {
      code: normalizedError.code,
      message: normalizedError.message,
      category: normalizedError.category,
      userMessage: showUserMessage ? userFriendlyError.message : null,
      originalError: process.env.NODE_ENV === 'development' ? error : null,
    };

    // ✅ Throw error if requested
    if (throwError) {
      const formattedError = createError(normalizedError.code, normalizedError.message);
      throw formattedError;
    }

    return errorResponse;
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
        const normalizedError = normalizeError(error);
        const isRetryable = retryableErrors.length === 0 || 
          retryableErrors.some(pattern => 
            error.message?.includes(pattern) || 
            normalizedError.code?.includes(pattern) ||
            error.name?.includes(pattern)
          );

        if (!isRetryable || attempt === maxRetries) {
          logger.error(`Operation failed after ${attempt + 1} attempts:`, {
            error: normalizedError,
            attempt: attempt + 1,
            maxRetries: maxRetries + 1,
          });
          throw error;
        }

        logger.warn(`Operation failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, {
          error: normalizedError.message,
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
      const normalizedError = normalizeError(error);
      logger.warn('Operation failed, using fallback value:', {
        error: normalizedError,
        context,
      });
      return fallbackValue;
    }
  }

  /**
   * ✅ Handle error in React component
   * معالجة خطأ في React component
   * 
   * @param {Error} error - الخطأ
   * @param {Object} errorInfo - React error info
   * @param {Function} setError - State setter for error
   */
  static handleComponentError(error, errorInfo = {}, setError = null) {
    const normalizedError = normalizeError(error);
    const userFriendlyError = getUserFriendlyError(error);

    logger.error('Component error:', {
      error: normalizedError,
      errorInfo,
    });

    if (setError) {
      setError({
        message: userFriendlyError.message,
        code: normalizedError.code,
        category: normalizedError.category,
      });
    }

    return {
      message: userFriendlyError.message,
      code: normalizedError.code,
      category: normalizedError.category,
    };
  }

  /**
   * ✅ Handle error in Promise
   * معالجة خطأ في Promise
   * 
   * @param {Promise} promise - Promise to handle
   * @param {Object} options - Options للـ error handling
   * @returns {Promise} Promise with error handling
   */
  static handlePromise(promise, options = {}) {
    const {
      fallbackValue = null,
      logError = true,
    } = options;

    return promise
      .catch(error => {
        const normalizedError = normalizeError(error);
        
        if (logError) {
          logger.error('Promise error:', normalizedError);
        }

        if (fallbackValue !== null) {
          return fallbackValue;
        }

        throw error;
      });
  }

  /**
   * ✅ Validate error
   * التحقق من صحة الخطأ
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
    if (allowedCodes.length > 0) {
      const normalizedError = normalizeError(error);
      if (!allowedCodes.includes(normalizedError.code)) {
        return {
          valid: false,
          reason: `Error code not allowed: ${normalizedError.code}`,
        };
      }
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

export default ErrorHandler;

