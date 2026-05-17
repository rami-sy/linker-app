/**
 * Error Codes - رموز الأخطاء الموحدة
 * 
 * هذا الملف يوفر:
 * 1. رموز موحدة للأخطاء
 * 2. رسائل خطأ واضحة
 * 3. تصنيف الأخطاء
 */

export const ERROR_CODES = {
  // Device Errors
  DEVICE_NOT_FOUND: 'DEVICE_NOT_FOUND',
  DEVICE_PERMISSION_DENIED: 'DEVICE_PERMISSION_DENIED',
  DEVICE_IN_USE: 'DEVICE_IN_USE',
  DEVICE_NOT_SUPPORTED: 'DEVICE_NOT_SUPPORTED',
  DEVICE_CONSTRAINT_ERROR: 'DEVICE_CONSTRAINT_ERROR',
  
  // Stream Errors
  STREAM_CREATION_FAILED: 'STREAM_CREATION_FAILED',
  STREAM_NOT_AVAILABLE: 'STREAM_NOT_AVAILABLE',
  STREAM_PERMISSION_DENIED: 'STREAM_PERMISSION_DENIED',
  
  // Call Errors
  CALL_START_FAILED: 'CALL_START_FAILED',
  CALL_JOIN_FAILED: 'CALL_JOIN_FAILED',
  CALL_ACCEPT_FAILED: 'CALL_ACCEPT_FAILED',
  CALL_REJECT_FAILED: 'CALL_REJECT_FAILED',
  CALL_LEAVE_FAILED: 'CALL_LEAVE_FAILED',
  CALL_END_FAILED: 'CALL_END_FAILED',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  RECORDING_FAILED: 'RECORDING_FAILED',
  CALL_TRANSFER_FAILED: 'CALL_TRANSFER_FAILED',
  CALL_TRANSFER_PERMISSION_DENIED: 'CALL_TRANSFER_PERMISSION_DENIED',
  CALL_KICK_PERMISSION_DENIED: 'CALL_KICK_PERMISSION_DENIED',
  CALL_MUTE_OTHERS_PERMISSION_DENIED: 'CALL_MUTE_OTHERS_PERMISSION_DENIED',
  CALL_MODERATOR_PERMISSION_DENIED: 'CALL_MODERATOR_PERMISSION_DENIED',
  
  // Network Errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  SOCKET_DISCONNECTED: 'SOCKET_DISCONNECTED',
  SERVER_ERROR: 'SERVER_ERROR',
  
  // State Errors
  INVALID_STATE: 'INVALID_STATE',
  STATE_TRANSITION_FAILED: 'STATE_TRANSITION_FAILED',
  
  // Producer/Consumer Errors
  PRODUCER_NOT_FOUND: 'PRODUCER_NOT_FOUND',
  CONSUMER_NOT_FOUND: 'CONSUMER_NOT_FOUND',
  CANNOT_CONSUME: 'CANNOT_CONSUME',
  
  // Generic Errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  OPERATION_FAILED: 'OPERATION_FAILED',
  INVALID_INPUT: 'INVALID_INPUT'
};

export const ERROR_MESSAGES = {
  [ERROR_CODES.DEVICE_NOT_FOUND]: 'No audio or video devices found. Please connect a microphone or camera and grant permissions.',
  [ERROR_CODES.DEVICE_PERMISSION_DENIED]: 'Permission denied. Please grant camera and microphone permissions.',
  [ERROR_CODES.DEVICE_IN_USE]: 'Device is already in use by another application.',
  [ERROR_CODES.DEVICE_NOT_SUPPORTED]: 'Your browser does not support camera/microphone access. Please use HTTPS or a modern browser.',
  [ERROR_CODES.DEVICE_CONSTRAINT_ERROR]: 'Camera/microphone does not meet the required constraints.',
  
  [ERROR_CODES.STREAM_CREATION_FAILED]: 'Failed to create media stream. Please check your devices and permissions.',
  [ERROR_CODES.STREAM_NOT_AVAILABLE]: 'Media stream is not available.',
  [ERROR_CODES.STREAM_PERMISSION_DENIED]: 'Permission denied for media stream access.',
  
  [ERROR_CODES.CALL_START_FAILED]: 'Failed to start call. Please try again.',
  [ERROR_CODES.CALL_JOIN_FAILED]: 'Failed to join call. Please check your connection.',
  [ERROR_CODES.CALL_ACCEPT_FAILED]: 'Failed to accept call. Please try again.',
  [ERROR_CODES.CALL_REJECT_FAILED]: 'Failed to reject call.',
  [ERROR_CODES.CALL_LEAVE_FAILED]: 'Failed to leave call.',
  [ERROR_CODES.CALL_END_FAILED]: 'Failed to end call.',
  [ERROR_CODES.ROOM_NOT_FOUND]: 'Room not found. The chat room may have been deleted or does not exist.',
  [ERROR_CODES.RECORDING_FAILED]: 'Failed to record call. Please try again.',
  [ERROR_CODES.CALL_TRANSFER_FAILED]: 'Failed to transfer call. Please try again.',
  [ERROR_CODES.CALL_TRANSFER_PERMISSION_DENIED]: 'You are not allowed to transfer this call.',
  [ERROR_CODES.CALL_KICK_PERMISSION_DENIED]: 'You are not allowed to remove participants.',
  [ERROR_CODES.CALL_MUTE_OTHERS_PERMISSION_DENIED]: 'You are not allowed to mute all participants.',
  [ERROR_CODES.CALL_MODERATOR_PERMISSION_DENIED]: 'You are not allowed to update moderator roles.',
  
  [ERROR_CODES.NETWORK_ERROR]: 'Network error occurred. Please check your connection.',
  [ERROR_CODES.NETWORK_TIMEOUT]: 'Connection timeout. The server is taking too long to respond. Please try again.',
  [ERROR_CODES.SOCKET_DISCONNECTED]: 'Connection lost. Please reconnect.',
  [ERROR_CODES.SERVER_ERROR]: 'Server error occurred. Please try again.',
  
  [ERROR_CODES.INVALID_STATE]: 'Invalid operation for current state.',
  [ERROR_CODES.STATE_TRANSITION_FAILED]: 'State transition failed.',
  
  [ERROR_CODES.PRODUCER_NOT_FOUND]: 'Media producer was not found.',
  [ERROR_CODES.CONSUMER_NOT_FOUND]: 'Media consumer was not found.',
  [ERROR_CODES.CANNOT_CONSUME]: 'Cannot consume media from this producer. Codec may not be compatible.',
  
  [ERROR_CODES.UNKNOWN_ERROR]: 'An unknown error occurred.',
  [ERROR_CODES.OPERATION_FAILED]: 'Operation failed. Please try again.',
  [ERROR_CODES.INVALID_INPUT]: 'Invalid input provided. Please check your input and try again.'
};

export const ERROR_CATEGORIES = {
  DEVICE: 'device',
  STREAM: 'stream',
  CALL: 'call',
  NETWORK: 'network',
  STATE: 'state',
  GENERIC: 'generic'
};

/**
 * تصنيف الأخطاء حسب النوع
 */
export const ERROR_CATEGORY_MAP = {
  [ERROR_CODES.DEVICE_NOT_FOUND]: ERROR_CATEGORIES.DEVICE,
  [ERROR_CODES.DEVICE_PERMISSION_DENIED]: ERROR_CATEGORIES.DEVICE,
  [ERROR_CODES.DEVICE_IN_USE]: ERROR_CATEGORIES.DEVICE,
  [ERROR_CODES.DEVICE_NOT_SUPPORTED]: ERROR_CATEGORIES.DEVICE,
  [ERROR_CODES.DEVICE_CONSTRAINT_ERROR]: ERROR_CATEGORIES.DEVICE,
  
  [ERROR_CODES.STREAM_CREATION_FAILED]: ERROR_CATEGORIES.STREAM,
  [ERROR_CODES.STREAM_NOT_AVAILABLE]: ERROR_CATEGORIES.STREAM,
  [ERROR_CODES.STREAM_PERMISSION_DENIED]: ERROR_CATEGORIES.STREAM,
  
  [ERROR_CODES.CALL_START_FAILED]: ERROR_CATEGORIES.CALL,
  [ERROR_CODES.CALL_JOIN_FAILED]: ERROR_CATEGORIES.CALL,
  [ERROR_CODES.CALL_ACCEPT_FAILED]: ERROR_CATEGORIES.CALL,
  [ERROR_CODES.CALL_REJECT_FAILED]: ERROR_CATEGORIES.CALL,
  [ERROR_CODES.CALL_LEAVE_FAILED]: ERROR_CATEGORIES.CALL,
  [ERROR_CODES.CALL_END_FAILED]: ERROR_CATEGORIES.CALL,
  [ERROR_CODES.ROOM_NOT_FOUND]: ERROR_CATEGORIES.CALL,
  [ERROR_CODES.RECORDING_FAILED]: ERROR_CATEGORIES.CALL,
  [ERROR_CODES.CALL_TRANSFER_FAILED]: ERROR_CATEGORIES.CALL,
  [ERROR_CODES.CALL_TRANSFER_PERMISSION_DENIED]: ERROR_CATEGORIES.CALL,
  [ERROR_CODES.CALL_KICK_PERMISSION_DENIED]: ERROR_CATEGORIES.CALL,
  [ERROR_CODES.CALL_MUTE_OTHERS_PERMISSION_DENIED]: ERROR_CATEGORIES.CALL,
  [ERROR_CODES.CALL_MODERATOR_PERMISSION_DENIED]: ERROR_CATEGORIES.CALL,
  
  [ERROR_CODES.NETWORK_ERROR]: ERROR_CATEGORIES.NETWORK,
  [ERROR_CODES.NETWORK_TIMEOUT]: ERROR_CATEGORIES.NETWORK,
  [ERROR_CODES.SOCKET_DISCONNECTED]: ERROR_CATEGORIES.NETWORK,
  [ERROR_CODES.SERVER_ERROR]: ERROR_CATEGORIES.NETWORK,
  
  [ERROR_CODES.INVALID_STATE]: ERROR_CATEGORIES.STATE,
  [ERROR_CODES.STATE_TRANSITION_FAILED]: ERROR_CATEGORIES.STATE,
  
  [ERROR_CODES.UNKNOWN_ERROR]: ERROR_CATEGORIES.GENERIC,
  [ERROR_CODES.OPERATION_FAILED]: ERROR_CATEGORIES.GENERIC,
  [ERROR_CODES.INVALID_INPUT]: ERROR_CATEGORIES.GENERIC
};

/**
 * تحويل خطأ إلى رمز موحد
 * @param {Error} error - الخطأ الأصلي
 * @returns {Object} {code, message, category}
 */
export const normalizeError = (error) => {
  if (!error) {
    return {
      code: ERROR_CODES.UNKNOWN_ERROR,
      message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
      category: ERROR_CATEGORIES.GENERIC
    };
  }

  // Preserve known normalized/app-level error codes when already attached.
  if (
    typeof error.code === "string" &&
    Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, error.code)
  ) {
    return {
      code: error.code,
      message: error.message || ERROR_MESSAGES[error.code],
      category: ERROR_CATEGORY_MAP[error.code] || ERROR_CATEGORIES.GENERIC,
    };
  }

  // تحويل أخطاء getUserMedia
  if (error.name === 'NotFoundError') {
    return {
      code: ERROR_CODES.DEVICE_NOT_FOUND,
      message: ERROR_MESSAGES[ERROR_CODES.DEVICE_NOT_FOUND],
      category: ERROR_CATEGORIES.DEVICE
    };
  }
  
  if (error.name === 'NotAllowedError') {
    return {
      code: ERROR_CODES.DEVICE_PERMISSION_DENIED,
      message: ERROR_MESSAGES[ERROR_CODES.DEVICE_PERMISSION_DENIED],
      category: ERROR_CATEGORIES.DEVICE
    };
  }
  
  if (error.name === 'NotReadableError') {
    return {
      code: ERROR_CODES.DEVICE_IN_USE,
      message: ERROR_MESSAGES[ERROR_CODES.DEVICE_IN_USE],
      category: ERROR_CATEGORIES.DEVICE
    };
  }
  
  if (error.name === 'NotSupportedError') {
    return {
      code: ERROR_CODES.DEVICE_NOT_SUPPORTED,
      message: ERROR_MESSAGES[ERROR_CODES.DEVICE_NOT_SUPPORTED],
      category: ERROR_CATEGORIES.DEVICE
    };
  }
  
  if (error.name === 'OverconstrainedError') {
    return {
      code: ERROR_CODES.DEVICE_CONSTRAINT_ERROR,
      message: ERROR_MESSAGES[ERROR_CODES.DEVICE_CONSTRAINT_ERROR],
      category: ERROR_CATEGORIES.DEVICE
    };
  }

  // تحويل أخطاء المكالمات
  if (error.message.includes('Cannot start call')) {
    return {
      code: ERROR_CODES.CALL_START_FAILED,
      message: ERROR_MESSAGES[ERROR_CODES.CALL_START_FAILED],
      category: ERROR_CATEGORIES.CALL
    };
  }
  
  if (error.message.includes('Cannot join room')) {
    return {
      code: ERROR_CODES.CALL_JOIN_FAILED,
      message: ERROR_MESSAGES[ERROR_CODES.CALL_JOIN_FAILED],
      category: ERROR_CATEGORIES.CALL
    };
  }
  
  if (error.message.includes('Cannot accept call')) {
    return {
      code: ERROR_CODES.CALL_ACCEPT_FAILED,
      message: ERROR_MESSAGES[ERROR_CODES.CALL_ACCEPT_FAILED],
      category: ERROR_CATEGORIES.CALL
    };
  }
  
  if (error.message.includes('Cannot reject call')) {
    return {
      code: ERROR_CODES.CALL_REJECT_FAILED,
      message: ERROR_MESSAGES[ERROR_CODES.CALL_REJECT_FAILED],
      category: ERROR_CATEGORIES.CALL
    };
  }
  
  if (error.message.includes('Cannot leave room')) {
    return {
      code: ERROR_CODES.CALL_LEAVE_FAILED,
      message: ERROR_MESSAGES[ERROR_CODES.CALL_LEAVE_FAILED],
      category: ERROR_CATEGORIES.CALL
    };
  }
  
  if (error.message.includes('Cannot end call')) {
    return {
      code: ERROR_CODES.CALL_END_FAILED,
      message: ERROR_MESSAGES[ERROR_CODES.CALL_END_FAILED],
      category: ERROR_CATEGORIES.CALL
    };
  }

  // تحويل أخطاء الشبكة
  if (error.message.includes('Network error') || error.message.includes('connection')) {
    return {
      code: ERROR_CODES.NETWORK_ERROR,
      message: ERROR_MESSAGES[ERROR_CODES.NETWORK_ERROR],
      category: ERROR_CATEGORIES.NETWORK
    };
  }
  
  if (error.message.includes('Socket disconnected')) {
    return {
      code: ERROR_CODES.SOCKET_DISCONNECTED,
      message: ERROR_MESSAGES[ERROR_CODES.SOCKET_DISCONNECTED],
      category: ERROR_CATEGORIES.NETWORK
    };
  }

  // تحويل أخطاء الحالة
  if (error.message.includes('invalid state')) {
    return {
      code: ERROR_CODES.INVALID_STATE,
      message: ERROR_MESSAGES[ERROR_CODES.INVALID_STATE],
      category: ERROR_CATEGORIES.STATE
    };
  }
  
  if (error.message.includes('State transition')) {
    return {
      code: ERROR_CODES.STATE_TRANSITION_FAILED,
      message: ERROR_MESSAGES[ERROR_CODES.STATE_TRANSITION_FAILED],
      category: ERROR_CATEGORIES.STATE
    };
  }

  // خطأ غير معروف
  return {
    code: ERROR_CODES.UNKNOWN_ERROR,
    message: error.message || ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
    category: ERROR_CATEGORIES.GENERIC
  };
};

/**
 * إنشاء خطأ موحد
 * @param {string} code - رمز الخطأ
 * @param {string} message - رسالة الخطأ (اختيارية)
 * @returns {Error} خطأ موحد
 */
export const createError = (code, message = null) => {
  const errorMessage = message || ERROR_MESSAGES[code] || ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR];
  const error = new Error(errorMessage);
  error.code = code;
  error.category = ERROR_CATEGORY_MAP[code] || ERROR_CATEGORIES.GENERIC;
  return error;
};

export default {
  ERROR_CODES,
  ERROR_MESSAGES,
  ERROR_CATEGORIES,
  ERROR_CATEGORY_MAP,
  normalizeError,
  createError
};
