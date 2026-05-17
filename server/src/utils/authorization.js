/**
 * ✅ Comprehensive Authorization Utility
 * نظام شامل للتحقق من الصلاحيات والوصول
 */

const logger = require('./logger');
const Room = require('../models/room.model');
const Call = require('../models/call.model');
const User = require('../models/user.model');
const { withDbRetry } = require('./dbRetry');

/**
 * ✅ Roles المتاحة في النظام
 */
const ROLES = {
  ADMIN: 'admin',
  MODERATOR: 'moderator',
  MEMBER: 'member',
  BROADCASTER: 'broadcaster',
  VIEWER: 'viewer',
  GUEST: 'guest',
};

/**
 * ✅ Permissions لكل role
 */
const PERMISSIONS = {
  [ROLES.ADMIN]: [
    'manage_users',
    'manage_rooms',
    'manage_streams',
    'view_all_rooms',
    'moderate_content',
    'ban_users',
  ],
  [ROLES.MODERATOR]: [
    'moderate_content',
    'manage_streams',
    'view_all_rooms',
    'ban_users',
  ],
  [ROLES.MEMBER]: [
    'create_room',
    'join_room',
    'send_message',
    'start_call',
    'start_stream',
  ],
  [ROLES.BROADCASTER]: [
    'produce_media',
    'control_stream',
    'moderate_stream',
  ],
  [ROLES.VIEWER]: [
    'consume_media',
    'send_comments',
    'send_reactions',
  ],
  [ROLES.GUEST]: [
    'view_public_streams',
  ],
};

/**
 * ✅ Authorization Result Class
 */
class AuthorizationResult {
  constructor(authorized, error = null, data = {}) {
    this.authorized = authorized;
    this.error = error;
    this.data = data;
  }

  static success(data = {}) {
    return new AuthorizationResult(true, null, data);
  }

  static failure(error, data = {}) {
    return new AuthorizationResult(false, error, data);
  }
}

/**
 * ✅ Authorization Service Class
 */
class AuthorizationService {
  /**
   * ✅ التحقق من أن المستخدم مصادق عليه
   */
  static verifyAuthentication(socket) {
    if (!socket || !socket.user || !socket.user._id) {
      return AuthorizationResult.failure('User not authenticated');
    }
    return AuthorizationResult.success({ userId: socket.user._id });
  }

  /**
   * ✅ التحقق من أن userId يطابق المستخدم المصادق عليه
   */
  static verifyUserId(socket, userId) {
    const authCheck = this.verifyAuthentication(socket);
    if (!authCheck.authorized) {
      return authCheck;
    }

    const authenticatedUserId = socket.user._id.toString();
    const providedUserId = userId?.toString();

    if (authenticatedUserId !== providedUserId) {
      logger.warn(`❌ User ID mismatch: authenticated=${authenticatedUserId}, provided=${providedUserId}`, {
        socketId: socket.id,
        authenticatedUserId,
        providedUserId,
      });
      return AuthorizationResult.failure('User ID does not match authenticated user');
    }

    return AuthorizationResult.success({ userId: authenticatedUserId });
  }

  /**
   * ✅ التحقق من أن المستخدم لديه permission معين
   */
  static hasPermission(userRole, permission) {
    const rolePermissions = PERMISSIONS[userRole] || [];
    return rolePermissions.includes(permission);
  }

  /**
   * ✅ التحقق من أن المستخدم عضو في الغرفة
   * يدعم Live Streams مع roles (broadcaster/viewer)
   */
  static async verifyRoomMembership(roomId, userId, requiredRole = 'member') {
    try {
      // ✅ التحقق من صحة roomId قبل الاستعلام
      if (!roomId || (typeof roomId === 'string' && roomId.trim() === '')) {
        logger.error('verifyRoomMembership: Invalid roomId', { roomId, type: typeof roomId, userId });
        return AuthorizationResult.failure('Invalid room ID');
      }

      logger.debug('verifyRoomMembership: Checking room', { roomId, userId, requiredRole });

      const chatRoom = await withDbRetry(
        () => Room.findById(roomId).lean(),
        {
          maxRetries: 2,
          initialDelay: 500,
          operationName: 'Find room for membership check',
        }
      );

      if (!chatRoom) {
        logger.error('verifyRoomMembership: Room not found in database', { roomId, userId });
        return AuthorizationResult.failure('Room not found');
      }

      // ✅ البحث عن مكالمة نشطة مع ستريم في هذه الغرفة
      const activeStreamCall = await withDbRetry(
        () => Call.findOne({
          room: roomId,
          isLiveStream: true,
          'liveStreamSettings.isLive': true,
          endedAt: null,
        })
          .sort({ startedAt: -1 })
          .lean(),
        {
          maxRetries: 2,
          initialDelay: 500,
          operationName: 'Find active stream call',
        }
      );

      // ✅ إذا كانت Live Stream
      if (activeStreamCall) {
        // ✅ التحقق من requiredRole أولاً
        // إذا كان requiredRole === VIEWER صراحة، نسمح بالانضمام كـ viewer حتى لو كان broadcaster
        if (requiredRole === ROLES.VIEWER) {
          // التحقق من maxViewers
          const currentViewers = activeStreamCall.liveStreamSettings?.viewersCount || 0;
          const maxViewers = activeStreamCall.liveStreamSettings?.maxViewers || 1000;
          if (currentViewers >= maxViewers) {
            return AuthorizationResult.failure('Stream is full. Maximum viewers reached');
          }

          // ✅ السماح بالانضمام كـ viewer حتى لو كان broadcaster
          // (مثلاً إذا كان broadcaster يريد مشاهدة الستريم من جهاز آخر)
          const isBroadcasterInList = activeStreamCall.broadcasters?.some(
            id => id.toString() === userId.toString()
          );
          if (isBroadcasterInList) {
            return AuthorizationResult.success({
              room: chatRoom,
              call: activeStreamCall,
              role: ROLES.VIEWER,
              isViewer: true,
            });
          }

          // ✅ إذا كان المستخدم عضو في الـ room، يمكنه الانضمام كـ viewer
          const isMember = chatRoom.members?.some(
            memberId => memberId.toString() === userId.toString()
          );

          if (isMember) {
            return AuthorizationResult.success({
              room: chatRoom,
              call: activeStreamCall,
              role: ROLES.VIEWER,
              isViewer: true,
            });
          }

          // ✅ إذا كان allowAnonymousViewers مفعل، يمكن للمشاهدين الانضمام حتى لو لم يكونوا أعضاء
          if (activeStreamCall.liveStreamSettings?.allowAnonymousViewers) {
            return AuthorizationResult.success({
              room: chatRoom,
              call: activeStreamCall,
              role: ROLES.VIEWER,
              isViewer: true,
              isAnonymous: true,
            });
          }

          return AuthorizationResult.failure(
            'User is not allowed to join this live stream'
          );
        }

        // ✅ إذا كان broadcaster و requiredRole !== VIEWER، نرجع BROADCASTER
        const isBroadcaster = activeStreamCall.broadcasters?.some(
          id => id.toString() === userId.toString()
        );

        if (isBroadcaster) {
          return AuthorizationResult.success({
            room: chatRoom,
            call: activeStreamCall,
            role: ROLES.BROADCASTER,
            isBroadcaster: true,
          });
        }

        // ✅ إذا كان viewer أو role غير محدد
        if (!requiredRole || requiredRole === ROLES.MEMBER) {
          // التحقق من maxViewers
          const currentViewers = activeStreamCall.liveStreamSettings?.viewersCount || 0;
          const maxViewers = activeStreamCall.liveStreamSettings?.maxViewers || 1000;
          if (currentViewers >= maxViewers) {
            return AuthorizationResult.failure('Stream is full. Maximum viewers reached');
          }

          // ✅ إذا كان المستخدم عضو في الـ room، يمكنه الانضمام كـ viewer
          const isMember = chatRoom.members?.some(
            memberId => memberId.toString() === userId.toString()
          );

          if (isMember) {
            return AuthorizationResult.success({
              room: chatRoom,
              call: activeStreamCall,
              role: ROLES.VIEWER,
              isViewer: true,
            });
          }

          // ✅ إذا كان allowAnonymousViewers مفعل، يمكن للمشاهدين الانضمام حتى لو لم يكونوا أعضاء
          if (activeStreamCall.liveStreamSettings?.allowAnonymousViewers) {
            return AuthorizationResult.success({
              room: chatRoom,
              call: activeStreamCall,
              role: ROLES.VIEWER,
              isViewer: true,
              isAnonymous: true,
            });
          }

          // ✅ إذا كان المستخدم broadcaster (في broadcasters array)، يمكنه الانضمام كـ viewer أيضاً
          // (مثلاً إذا كان broadcaster يريد مشاهدة الستريم من جهاز آخر)
          const isBroadcasterInList = activeStreamCall.broadcasters?.some(
            id => id.toString() === userId.toString()
          );
          if (isBroadcasterInList) {
            return AuthorizationResult.success({
              room: chatRoom,
              call: activeStreamCall,
              role: ROLES.VIEWER,
              isViewer: true,
            });
          }

          return AuthorizationResult.failure(
            'User is not allowed to join this live stream'
          );
        }

        return AuthorizationResult.failure('User is not authorized to access this stream');
      }

      // ✅ مكالمة عادية أو غرفة عادية
      const isMember = chatRoom.members?.some(
        memberId => memberId.toString() === userId.toString()
      );

      if (!isMember) {
        return AuthorizationResult.failure('User is not a member of this room');
      }

      return AuthorizationResult.success({
        room: chatRoom,
        role: ROLES.MEMBER,
        isMember: true,
      });
    } catch (error) {
      logger.error('Error in verifyRoomMembership:', error);
      return AuthorizationResult.failure('Failed to verify room membership', { error: error.message });
    }
  }

  /**
   * ✅ التحقق من أن المستخدم هو مالك الغرفة أو admin
   */
  static async verifyRoomOwner(roomId, userId) {
    try {
      const chatRoom = await withDbRetry(
        () => Room.findById(roomId).lean(),
        {
          maxRetries: 2,
          initialDelay: 500,
          operationName: 'Find room for owner check',
        }
      );

      if (!chatRoom) {
        return AuthorizationResult.failure('Room not found');
      }

      // ✅ التحقق من أن المستخدم هو المالك
      const isOwner = chatRoom.createdBy?.toString() === userId.toString();

      if (!isOwner) {
        // ✅ التحقق من أن المستخدم admin
        const user = await withDbRetry(
          () => User.findById(userId).select('role').lean(),
          {
            maxRetries: 2,
            initialDelay: 500,
            operationName: 'Find user for role check',
          }
        );

        if (user?.role !== ROLES.ADMIN) {
          return AuthorizationResult.failure('User is not the room owner or admin');
        }
      }

      return AuthorizationResult.success({
        room: chatRoom,
        isOwner,
        isAdmin: !isOwner,
      });
    } catch (error) {
      logger.error('Error in verifyRoomOwner:', error);
      return AuthorizationResult.failure('Failed to verify room ownership', { error: error.message });
    }
  }

  /**
   * ✅ التحقق من أن المستخدم هو broadcaster في الستريم
   */
  static async verifyBroadcaster(callId, userId) {
    try {
      const call = await withDbRetry(
        () => Call.findById(callId).lean(),
        {
          maxRetries: 2,
          initialDelay: 500,
          operationName: 'Find call for broadcaster check',
        }
      );

      if (!call) {
        return AuthorizationResult.failure('Call not found');
      }

      if (!call.isLiveStream) {
        return AuthorizationResult.failure('Call is not a live stream');
      }

      const isBroadcaster = call.broadcasters?.some(
        id => id.toString() === userId.toString()
      );

      if (!isBroadcaster) {
        return AuthorizationResult.failure('User is not a broadcaster of this stream');
      }

      return AuthorizationResult.success({
        call,
        isBroadcaster: true,
      });
    } catch (error) {
      logger.error('Error in verifyBroadcaster:', error);
      return AuthorizationResult.failure('Failed to verify broadcaster status', { error: error.message });
    }
  }

  /**
   * ✅ التحقق من أن المستخدم لديه role معين
   */
  static async verifyUserRole(userId, requiredRole) {
    try {
      const user = await withDbRetry(
        () => User.findById(userId).select('role').lean(),
        {
          maxRetries: 2,
          initialDelay: 500,
          operationName: 'Find user for role check',
        }
      );

      if (!user) {
        return AuthorizationResult.failure('User not found');
      }

      const userRole = user.role || ROLES.MEMBER;

      // ✅ Admin لديه جميع الصلاحيات
      if (userRole === ROLES.ADMIN) {
        return AuthorizationResult.success({ role: userRole, isAdmin: true });
      }

      // ✅ التحقق من role محدد
      if (userRole !== requiredRole) {
        return AuthorizationResult.failure(`User does not have required role: ${requiredRole}`);
      }

      return AuthorizationResult.success({ role: userRole });
    } catch (error) {
      logger.error('Error in verifyUserRole:', error);
      return AuthorizationResult.failure('Failed to verify user role', { error: error.message });
    }
  }

  /**
   * ✅ التحقق من أن المستخدم لديه permission للعمل المطلوب
   */
  static async verifyPermission(userId, permission) {
    try {
      const user = await withDbRetry(
        () => User.findById(userId).select('role').lean(),
        {
          maxRetries: 2,
          initialDelay: 500,
          operationName: 'Find user for permission check',
        }
      );

      if (!user) {
        return AuthorizationResult.failure('User not found');
      }

      const userRole = user.role || ROLES.MEMBER;

      if (!this.hasPermission(userRole, permission)) {
        return AuthorizationResult.failure(`User does not have permission: ${permission}`);
      }

      return AuthorizationResult.success({ role: userRole, permission });
    } catch (error) {
      logger.error('Error in verifyPermission:', error);
      return AuthorizationResult.failure('Failed to verify permission', { error: error.message });
    }
  }
}

module.exports = {
  AuthorizationService,
  AuthorizationResult,
  ROLES,
  PERMISSIONS,
};

