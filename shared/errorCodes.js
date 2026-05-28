/**
 * Error codes shared between client and server.
 */
const SHARED_ERROR_CODES = {
  ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
  USER_NOT_AUTHENTICATED: "USER_NOT_AUTHENTICATED",
  NOT_ROOM_MEMBER: "NOT_ROOM_MEMBER",
  INVALID_INPUT: "INVALID_INPUT",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  NETWORK_ERROR: "NETWORK_ERROR",
  SERVER_ERROR: "SERVER_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  OPERATION_FAILED: "OPERATION_FAILED",
  PRODUCER_NOT_FOUND: "PRODUCER_NOT_FOUND",
  CONSUMER_NOT_FOUND: "CONSUMER_NOT_FOUND",
  CANNOT_CONSUME: "CANNOT_CONSUME",
};

const SHARED_ERROR_MESSAGES = {
  [SHARED_ERROR_CODES.ROOM_NOT_FOUND]: "Room not found",
  [SHARED_ERROR_CODES.USER_NOT_AUTHENTICATED]: "User not authenticated",
  [SHARED_ERROR_CODES.NOT_ROOM_MEMBER]: "User is not a member of this room",
  [SHARED_ERROR_CODES.INVALID_INPUT]: "Invalid input data",
  [SHARED_ERROR_CODES.MISSING_REQUIRED_FIELD]: "Missing required field",
  [SHARED_ERROR_CODES.RATE_LIMIT_EXCEEDED]: "Rate limit exceeded",
  [SHARED_ERROR_CODES.NETWORK_ERROR]: "Network error occurred",
  [SHARED_ERROR_CODES.SERVER_ERROR]: "Server error occurred",
  [SHARED_ERROR_CODES.UNKNOWN_ERROR]: "An unknown error occurred",
  [SHARED_ERROR_CODES.OPERATION_FAILED]: "Operation failed",
  [SHARED_ERROR_CODES.PRODUCER_NOT_FOUND]: "Producer not found",
  [SHARED_ERROR_CODES.CONSUMER_NOT_FOUND]: "Consumer not found",
  [SHARED_ERROR_CODES.CANNOT_CONSUME]: "Cannot consume this producer",
};

function formatSharedError({
  message,
  code = SHARED_ERROR_CODES.UNKNOWN_ERROR,
  details,
} = {}) {
  const safeMessage =
    message || SHARED_ERROR_MESSAGES[code] || SHARED_ERROR_MESSAGES.UNKNOWN_ERROR;

  return {
    type: "error",
    success: false,
    message: safeMessage,
    error: safeMessage,
    code,
    ...(details ? { details } : {}),
  };
}

function formatSharedSuccess({ message = "OK", data } = {}) {
  return {
    type: "success",
    success: true,
    message,
    ...(data !== undefined ? { data } : {}),
  };
}

module.exports = {
  SHARED_ERROR_CODES,
  SHARED_ERROR_MESSAGES,
  formatSharedError,
  formatSharedSuccess,
};
