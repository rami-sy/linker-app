/**
 * ✅ Comprehensive Input Validation
 * Joi schemas لجميع socket handlers
 */

const Joi = require('joi');

// ✅ Common validation patterns
const commonPatterns = {
  mongoId: /^[a-fA-F0-9]{24}$/,
  roomId: /^[a-zA-Z0-9_-]+$/,
  socketId: /^[a-zA-Z0-9_-]+$/,
};

// ✅ Common schemas
const commonSchemas = {
  mongoId: Joi.string().pattern(commonPatterns.mongoId).required().messages({
    'string.pattern.base': 'Invalid ID format',
    'any.required': 'ID is required',
  }),
  roomId: Joi.string().min(1).max(100).pattern(commonPatterns.roomId).required().messages({
    'string.pattern.base': 'Room ID must contain only alphanumeric characters, hyphens, and underscores',
    'any.required': 'Room ID is required',
  }),
  userId: Joi.string().min(1).max(50).pattern(commonPatterns.mongoId).required().messages({
    'string.pattern.base': 'User ID must be a valid MongoDB ObjectId',
    'any.required': 'User ID is required',
  }),
  userData: Joi.object({
    email: Joi.string().email().optional().allow(null, ''),
    _id: Joi.string().pattern(commonPatterns.mongoId).optional(),
    phoneNumber: Joi.string().min(10).max(20).optional().allow(null, ''),
    firstName: Joi.string().min(1).max(100).optional().allow(null, ''),
    lastName: Joi.string().min(1).max(100).optional().allow(null, ''),
    images: Joi.array().items(Joi.object({
      _id: Joi.string().optional(),
      // ✅ Accept both relative paths (starting with /) and absolute URIs (http:// or https://)
      path: Joi.string().custom((value, helpers) => {
        if (!value) return value; // Allow empty/null values
        // Check if it's a relative path (starts with /) or absolute URI (starts with http:// or https://)
        if (value.startsWith('/') || value.startsWith('http://') || value.startsWith('https://')) {
          return value;
        }
        return helpers.error('string.path.invalid');
      }, 'Image path validation').optional().allow(null, ''),
      thumbnail: Joi.string().optional().allow(null, ''),
    })).optional(),
    colors: Joi.array().items(Joi.object()).optional(),
  }).optional(),
  settings: Joi.object({
    title: Joi.string().min(1).max(200).optional(),
    description: Joi.string().max(1000).optional().allow(null, ''),
    allowAnonymousViewers: Joi.boolean().optional(),
    maxViewers: Joi.number().integer().min(1).max(10000).optional(),
    isPublic: Joi.boolean().optional(),
  }).optional(),
};

// ✅ Call-related schemas
const callRequestSchema = Joi.object({
  roomId: commonSchemas.roomId,
  callerId: commonSchemas.userId,
  callerData: commonSchemas.userData,
  isVideoCall: Joi.boolean().default(true),
});

const callRejectedSchema = Joi.object({
  roomId: commonSchemas.roomId,
  callerId: commonSchemas.userId,
  rejectedByUserId: commonSchemas.userId,
});

const callCancelledSchema = Joi.object({
  roomId: commonSchemas.roomId,
  callerId: commonSchemas.userId,
});

// ✅ Room-related schemas
const getRouterRtpCapabilitiesSchema = Joi.object({
  roomId: commonSchemas.roomId,
});

const joinRoomSchema = Joi.object({
  roomId: commonSchemas.roomId,
  userId: commonSchemas.userId,
  userData: commonSchemas.userData,
  isCaller: Joi.boolean().optional(),
  isVideoCall: Joi.boolean().default(true),
  role: Joi.string().valid('member', 'broadcaster', 'viewer').default('member'),
  joinRequestId: Joi.string().max(128).optional(),
});

const leaveRoomSchema = Joi.object({
  roomId: commonSchemas.roomId,
  userId: commonSchemas.userId,
});

const endCallSchema = Joi.object({
  roomId: commonSchemas.roomId,
  userId: commonSchemas.userId,
});

const getRoomInfoSchema = Joi.object({
  roomId: commonSchemas.roomId,
});

// ✅ Transport-related schemas
const createWebRtcTransportSchema = Joi.object({
  roomId: commonSchemas.roomId,
  direction: Joi.string().valid('send', 'recv').required().messages({
    'any.only': 'Direction must be either "send" or "recv"',
    'any.required': 'Direction is required',
  }),
});

const connectWebRtcTransportSchema = Joi.object({
  roomId: commonSchemas.roomId,
  transportId: Joi.string().min(1).max(100).required().messages({
    'any.required': 'Transport ID is required',
  }),
  dtlsParameters: Joi.object({
    role: Joi.string().valid('auto', 'client', 'server').required(),
    fingerprints: Joi.array().items(Joi.object({
      algorithm: Joi.string().required(),
      value: Joi.string().required(),
    })).required(),
  }).required().messages({
    'any.required': 'DTLS parameters are required',
  }),
});

// ✅ Producer/Consumer schemas
const produceSchema = Joi.object({
  roomId: commonSchemas.roomId,
  transportId: Joi.string().min(1).max(100).required(),
  kind: Joi.string().valid('audio', 'video').required().messages({
    'any.only': 'Kind must be either "audio" or "video"',
    'any.required': 'Kind is required',
  }),
  rtpParameters: Joi.object({
    codecs: Joi.array().items(Joi.object()).required(),
    headerExtensions: Joi.array().items(Joi.object()).optional(),
    encodings: Joi.array().items(Joi.object()).optional(),
    rtcp: Joi.object().optional(),
  }).required().messages({
    'any.required': 'RTP parameters are required',
  }),
  appData: Joi.object().optional(),
});

const consumeSchema = Joi.object({
  roomId: commonSchemas.roomId,
  transportId: Joi.string().min(1).max(100).required(),
  producerId: Joi.string().min(1).max(100).required().messages({
    'any.required': 'Producer ID is required',
  }),
  rtpCapabilities: Joi.object({
    codecs: Joi.array().items(Joi.object()).optional(),
    headerExtensions: Joi.array().items(Joi.object()).optional(),
  }).required().messages({
    'any.required': 'RTP capabilities are required',
  }),
});

const resumeConsumerSchema = Joi.object({
  roomId: commonSchemas.roomId,
  consumerId: Joi.string().min(1).max(100).required().messages({
    'any.required': 'Consumer ID is required',
  }),
});

const pauseProducerSchema = Joi.object({
  roomId: commonSchemas.roomId,
  producerId: Joi.string().min(1).max(100).required().messages({
    'any.required': 'Producer ID is required',
  }),
});

const resumeProducerSchema = Joi.object({
  roomId: commonSchemas.roomId,
  producerId: Joi.string().min(1).max(100).required().messages({
    'any.required': 'Producer ID is required',
  }),
});

const closeProducerSchema = Joi.object({
  roomId: commonSchemas.roomId,
  producerId: Joi.string().min(1).max(100).required().messages({
    'any.required': 'Producer ID is required',
  }),
});

// ✅ Call History schemas
const getCallHistorySchema = Joi.object({
  page: Joi.number().integer().min(1).max(1000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  roomId: commonSchemas.roomId.optional(),
  search: Joi.string().allow("").max(120).optional(),
  includeTotal: Joi.boolean().default(false),
  filters: Joi.object({
    type: Joi.string().valid("all", "video", "audio").default("all"),
    status: Joi.string()
      .valid("all", "answered", "missed", "rejected", "cancelled")
      .default("all"),
    direction: Joi.string()
      .valid("all", "outgoing", "incoming")
      .default("all"),
  })
    .default({
      type: "all",
      status: "all",
      direction: "all",
    })
    .optional(),
});

const deleteCallSchema = Joi.object({
  callId: commonSchemas.mongoId,
});

// ✅ Live Stream schemas
const startLiveStreamSchema = Joi.object({
  roomId: commonSchemas.roomId,
  settings: commonSchemas.settings,
});

const requestLiveStreamSchema = Joi.object({
  roomId: commonSchemas.roomId,
  userData: commonSchemas.userData,
  settings: commonSchemas.settings,
});

const respondToLiveStreamRequestSchema = Joi.object({
  roomId: commonSchemas.roomId,
  accepted: Joi.boolean().required().messages({
    'any.required': 'Accepted status is required',
  }),
  settings: commonSchemas.settings,
});

const stopLiveStreamSchema = Joi.object({
  roomId: commonSchemas.roomId,
});

const getLiveStreamsSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
});

const getStreamInfoSchema = Joi.object({
  roomId: commonSchemas.roomId,
});

const sendStreamCommentSchema = Joi.object({
  streamId: commonSchemas.mongoId,
  comment: Joi.string().min(1).max(500).required().trim().messages({
    'string.min': 'Comment must be at least 1 character long',
    'string.max': 'Comment must be no more than 500 characters long',
    'any.required': 'Comment is required',
  }),
});

const sendStreamReactionSchema = Joi.object({
  streamId: commonSchemas.mongoId,
  reaction: Joi.string().valid('like', 'love', 'laugh', 'wow', 'sad', 'angry').required().messages({
    'any.only': 'Reaction must be one of: like, love, laugh, wow, sad, angry',
    'any.required': 'Reaction is required',
  }),
});

// ✅ Validation schemas map
const validationSchemas = {
  callRequest: callRequestSchema,
  callRejected: callRejectedSchema,
  callCancelled: callCancelledSchema,
  getRouterRtpCapabilities: getRouterRtpCapabilitiesSchema,
  joinRoom: joinRoomSchema,
  leaveRoom: leaveRoomSchema,
  endCall: endCallSchema,
  getRoomInfo: getRoomInfoSchema,
  createWebRtcTransport: createWebRtcTransportSchema,
  connectWebRtcTransport: connectWebRtcTransportSchema,
  produce: produceSchema,
  consume: consumeSchema,
  resumeConsumer: resumeConsumerSchema,
  pauseProducer: pauseProducerSchema,
  resumeProducer: resumeProducerSchema,
  closeProducer: closeProducerSchema,
  getCallHistory: getCallHistorySchema,
  deleteCall: deleteCallSchema,
  startLiveStream: startLiveStreamSchema,
  requestLiveStream: requestLiveStreamSchema,
  respondToLiveStreamRequest: respondToLiveStreamRequestSchema,
  stopLiveStream: stopLiveStreamSchema,
  getLiveStreams: getLiveStreamsSchema,
  getStreamInfo: getStreamInfoSchema,
  sendStreamComment: sendStreamCommentSchema,
  sendStreamReaction: sendStreamReactionSchema,
};

/**
 * ✅ Validate socket event data
 * @param {string} eventType - Event type name
 * @param {object} data - Data to validate
 * @returns {{ error: Joi.ValidationError | null, value: any }}
 */
const validateSocketEvent = (eventType, data) => {
  const schema = validationSchemas[eventType];
  
  if (!schema) {
    // ✅ إذا لم يكن هناك schema، نسمح بالبيانات (backward compatibility)
    return { error: null, value: data };
  }

  const { error, value } = schema.validate(data, {
    abortEarly: false, // Return all errors, not just the first one
    stripUnknown: true, // Remove unknown fields
    convert: true, // Convert types (e.g., string to number)
  });

  return { error, value };
};

/**
 * ✅ Validation middleware factory for Express (legacy support)
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const errorMessages = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        message: 'Validation failed',
        type: 'error',
        errors: errorMessages
      });
    }
    
    req.body = value;
    next();
  };
};

module.exports = {
  // ✅ Export all schemas
  callRequestSchema,
  callRejectedSchema,
  callCancelledSchema,
  getRouterRtpCapabilitiesSchema,
  joinRoomSchema,
  leaveRoomSchema,
  endCallSchema,
  getRoomInfoSchema,
  createWebRtcTransportSchema,
  connectWebRtcTransportSchema,
  produceSchema,
  consumeSchema,
  resumeConsumerSchema,
  pauseProducerSchema,
  resumeProducerSchema,
  closeProducerSchema,
  getCallHistorySchema,
  deleteCallSchema,
  startLiveStreamSchema,
  requestLiveStreamSchema,
  respondToLiveStreamRequestSchema,
  stopLiveStreamSchema,
  getLiveStreamsSchema,
  getStreamInfoSchema,
  sendStreamCommentSchema,
  sendStreamReactionSchema,
  // ✅ Export validation function
  validateSocketEvent,
  // ✅ Export schemas map
  validationSchemas,
  // ✅ Legacy support
  producerSchema: produceSchema,
  consumerSchema: consumeSchema,
  validate,
};
