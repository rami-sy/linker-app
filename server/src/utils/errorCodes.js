/**
 * Error Codes - رموز الأخطاء الموحدة للـ Server
 * 
 * هذا الملف يوفر:
 * 1. رموز موحدة للأخطاء
 * 2. رسائل خطأ واضحة
 * 3. تصنيف الأخطاء
 */

const ERROR_CODES = {
  // Room Errors
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_ALREADY_EXISTS: 'ROOM_ALREADY_EXISTS',
  ROOM_FULL: 'ROOM_FULL',
  
  // Peer Errors
  PEER_NOT_FOUND: 'PEER_NOT_FOUND',
  PEER_ALREADY_EXISTS: 'PEER_ALREADY_EXISTS',
  
  // Transport Errors
  TRANSPORT_NOT_FOUND: 'TRANSPORT_NOT_FOUND',
  TRANSPORT_CREATION_FAILED: 'TRANSPORT_CREATION_FAILED',
  TRANSPORT_CONNECTION_FAILED: 'TRANSPORT_CONNECTION_FAILED',
  
  // Producer/Consumer Errors
  PRODUCER_NOT_FOUND: 'PRODUCER_NOT_FOUND',
  CONSUMER_NOT_FOUND: 'CONSUMER_NOT_FOUND',
  CANNOT_CONSUME: 'CANNOT_CONSUME',
  PRODUCER_CREATION_FAILED: 'PRODUCER_CREATION_FAILED',
  CONSUMER_CREATION_FAILED: 'CONSUMER_CREATION_FAILED',
  
  // Authorization Errors
  USER_NOT_AUTHENTICATED: 'USER_NOT_AUTHENTICATED',
  USER_ID_MISMATCH: 'USER_ID_MISMATCH',
  NOT_ROOM_MEMBER: 'NOT_ROOM_MEMBER',
  PRODUCER_NOT_OWNED: 'PRODUCER_NOT_OWNED',
  
  // Validation Errors
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  
  // Rate Limiting Errors
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Network Errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  
  // Generic Errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  OPERATION_FAILED: 'OPERATION_FAILED'
};

const ERROR_MESSAGES = {
  [ERROR_CODES.ROOM_NOT_FOUND]: 'Room not found',
  [ERROR_CODES.ROOM_ALREADY_EXISTS]: 'Room already exists',
  [ERROR_CODES.ROOM_FULL]: 'Room is full',
  
  [ERROR_CODES.PEER_NOT_FOUND]: 'Peer not found',
  [ERROR_CODES.PEER_ALREADY_EXISTS]: 'Peer already exists',
  
  [ERROR_CODES.TRANSPORT_NOT_FOUND]: 'Transport not found',
  [ERROR_CODES.TRANSPORT_CREATION_FAILED]: 'Failed to create transport',
  [ERROR_CODES.TRANSPORT_CONNECTION_FAILED]: 'Failed to connect transport',
  
  [ERROR_CODES.PRODUCER_NOT_FOUND]: 'Producer not found',
  [ERROR_CODES.CONSUMER_NOT_FOUND]: 'Consumer not found',
  [ERROR_CODES.CANNOT_CONSUME]: 'Cannot consume this producer',
  [ERROR_CODES.PRODUCER_CREATION_FAILED]: 'Failed to create producer',
  [ERROR_CODES.CONSUMER_CREATION_FAILED]: 'Failed to create consumer',
  
  [ERROR_CODES.USER_NOT_AUTHENTICATED]: 'User not authenticated',
  [ERROR_CODES.USER_ID_MISMATCH]: 'User ID does not match authenticated user',
  [ERROR_CODES.NOT_ROOM_MEMBER]: 'User is not a member of this room',
  [ERROR_CODES.PRODUCER_NOT_OWNED]: 'Producer not found or not owned by user',
  
  [ERROR_CODES.INVALID_INPUT]: 'Invalid input data',
  [ERROR_CODES.MISSING_REQUIRED_FIELD]: 'Missing required field',
  
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded',
  
  [ERROR_CODES.NETWORK_ERROR]: 'Network error occurred',
  [ERROR_CODES.SERVER_ERROR]: 'Server error occurred',
  
  [ERROR_CODES.UNKNOWN_ERROR]: 'An unknown error occurred',
  [ERROR_CODES.OPERATION_FAILED]: 'Operation failed'
};

/**
 * إنشاء خطأ موحد
 * @param {string} code - رمز الخطأ
 * @param {string} message - رسالة الخطأ (اختيارية)
 * @returns {Error} خطأ موحد
 */
const createError = (code, message = null) => {
  const errorMessage = message || ERROR_MESSAGES[code] || ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR];
  const error = new Error(errorMessage);
  error.code = code;
  return error;
};

/**
 * ✅ تحويل خطأ إلى تنسيق موحد للـ callback
 * مع sanitization للأمان
 * @param {Error} error - الخطأ
 * @param {Object} context - Context للـ logging
 * @returns {Object} {success: false, error: string, code: string}
 */
const formatErrorForCallback = (error, context = {}) => {
  const { formatErrorForResponse } = require('./errorSanitizer');
  const sanitizedResponse = formatErrorForResponse(error, {
    ...context,
    includeDetails: process.env.NODE_ENV === 'development',
    logDetails: true,
  });
  
  const code = error?.code || ERROR_CODES.UNKNOWN_ERROR;
  
  return {
    success: false,
    error: sanitizedResponse.error,
    code: code,
    ...(process.env.NODE_ENV === 'development' && sanitizedResponse.sanitizedDetails ? {
      sanitizedDetails: sanitizedResponse.sanitizedDetails,
    } : {}),
  };
};

module.exports = {
  ERROR_CODES,
  ERROR_MESSAGES,
  createError,
  formatErrorForCallback
};









