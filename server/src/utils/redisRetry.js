/**
 * Redis Retry Utility
 * معالجة أخطاء Redis مع retry mechanism
 */

const logger = require('./logger');

/**
 * Execute Redis operation with retry mechanism
 * @param {Function} operation - Redis operation function (async)
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.initialDelay - Initial delay in ms (default: 500)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 5000)
 * @param {string} options.operationName - Name of operation for logging
 * @returns {Promise} Result of the operation
 */
const withRedisRetry = async (operation, options = {}) => {
  const {
    maxRetries = 3,
    initialDelay = 500,
    maxDelay = 5000,
    operationName = 'Redis operation'
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
        error.message?.includes('Connection') ||
        error.message?.includes('timeout') ||
        error.message?.includes('ECONNREFUSED') ||
        error.message?.includes('ENOTFOUND') ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT';
      
      // إذا لم يكن الخطأ قابلاً للاسترداد، نرمي الخطأ مباشرة
      if (!isRetryableError) {
        logger.error(`${operationName} failed with non-retryable error:`, error);
        throw error;
      }
      
      // إذا لم نصل للحد الأقصى، نعيد المحاولة
      if (attempt < maxRetries) {
        // Exponential backoff with jitter
        const delay = Math.min(
          initialDelay * Math.pow(2, attempt - 1) + Math.random() * 200,
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
 * Check if error is a Redis connection error
 * @param {Error} error - Error to check
 * @returns {boolean} True if it's a Redis connection error
 */
const isRedisConnectionError = (error) => {
  return (
    error.message?.includes('Connection') ||
    error.message?.includes('timeout') ||
    error.message?.includes('ECONNREFUSED') ||
    error.message?.includes('ENOTFOUND') ||
    error.code === 'ECONNREFUSED' ||
    error.code === 'ETIMEDOUT'
  );
};

module.exports = {
  withRedisRetry,
  isRedisConnectionError
};

