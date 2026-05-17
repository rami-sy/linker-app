/**
 * Database Retry Utility
 * معالجة أخطاء قاعدة البيانات مع retry mechanism
 */

const logger = require('./logger');

/**
 * Retry database operation with exponential backoff
 * @param {Function} operation - Database operation function
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.initialDelay - Initial delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 10000)
 * @param {string} options.operationName - Name of operation for logging
 * @returns {Promise} Result of the operation
 */
const withDbRetry = async (operation, options = {}) => {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    operationName = 'Database operation'
  } = options;

  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(`${operationName} - Attempt ${attempt}/${maxRetries}`);
      return await operation();
    } catch (error) {
      lastError = error;
      
      // ✅ التحقق من نوع الخطأ - نعيد المحاولة فقط للأخطاء القابلة للاسترداد
      const isRetryableError = 
        error.name === 'MongoNetworkError' ||
        error.name === 'MongoTimeoutError' ||
        error.name === 'MongoServerSelectionError' ||
        error.message?.includes('connection') ||
        error.message?.includes('timeout') ||
        error.message?.includes('network') ||
        error.code === 11000 || // Duplicate key error (can retry)
        error.code === 50 || // MaxTimeMSExpired
        error.code === 6; // HostUnreachable
      
      // إذا لم يكن الخطأ قابلاً للاسترداد، نرمي الخطأ مباشرة
      if (!isRetryableError) {
        logger.error(`${operationName} failed with non-retryable error:`, error);
        throw error;
      }
      
      // إذا لم نصل للحد الأقصى، نعيد المحاولة
      if (attempt < maxRetries) {
        // Exponential backoff with jitter
        const delay = Math.min(
          initialDelay * Math.pow(2, attempt - 1) + Math.random() * 1000,
          maxDelay
        );
        
        logger.warn(`${operationName} failed (attempt ${attempt}/${maxRetries}), retrying in ${Math.round(delay)}ms...`, {
          error: error.message,
          attempt,
          maxRetries
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        logger.error(`${operationName} failed after ${maxRetries} attempts:`, error);
      }
    }
  }
  
  throw lastError;
};

/**
 * Check if error is a database connection error
 * @param {Error} error - Error to check
 * @returns {boolean} True if it's a database connection error
 */
const isDbConnectionError = (error) => {
  return (
    error.name === 'MongoNetworkError' ||
    error.name === 'MongoTimeoutError' ||
    error.name === 'MongoServerSelectionError' ||
    error.message?.includes('connection') ||
    error.message?.includes('timeout') ||
    error.message?.includes('network') ||
    error.code === 50 || // MaxTimeMSExpired
    error.code === 6 // HostUnreachable
  );
};

/**
 * Check if error is a duplicate key error
 * @param {Error} error - Error to check
 * @returns {boolean} True if it's a duplicate key error
 */
const isDuplicateKeyError = (error) => {
  return error.code === 11000;
};

module.exports = {
  withDbRetry,
  isDbConnectionError,
  isDuplicateKeyError
};

