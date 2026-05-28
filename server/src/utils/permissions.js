/**
 * Permission Checking Utilities
 * 
 * Helper functions to check call and chat permissions
 * 
 * Architecture:
 * - User.defaultChatSettings / User.defaultCallSettings = Default settings copied when creating room/call
 * - Room.chatSettings = Active chat settings (highest priority for chat actions)
 * - Call.callSettings = Active call settings (highest priority for in-call actions)
 * 
 * Admin Definition:
 * - For Chat: Room admins (from room.roles)
 * - For Call: Call initiator (caller) + callAdmins + Room admins
 */

const User = require("../models/user.model");
const Room = require("../models/room.model");
const Call = require("../models/call.model");
const mongoose = require("mongoose");

/**
 * Valid permission values
 */
const {
  VALID_PERMISSION_VALUES,
  CALL_SETTINGS_KEYS,
} = require("../../../shared/permissions");

/**
 * Check if a user is an admin in a room
 * 
 * @param {String} userId - User ID
 * @param {Object} room - Room object or room ID
 * @returns {Boolean} - True if user is admin
 */
const isRoomAdmin = async (userId, room) => {
  try {
    let roomData = room;
    
    // If room is an ID, fetch it
    if (typeof room === "string" || room instanceof mongoose.Types.ObjectId) {
      roomData = await Room.findById(room).select("roles").lean();
    }
    
    if (!roomData?.roles) return false;
    
    const userRole = roomData.roles.find(
      role => role.user?.toString() === userId?.toString()
    );
    
    return userRole?.role === "admin";
  } catch (error) {
    console.error("Error checking room admin:", error);
    return false;
  }
};

/**
 * Check if a user is a moderator or higher in a room
 * 
 * @param {String} userId - User ID
 * @param {Object} room - Room object or room ID
 * @returns {Boolean} - True if user is moderator or admin
 */
const isRoomModerator = async (userId, room) => {
  try {
    let roomData = room;
    
    if (typeof room === "string" || room instanceof mongoose.Types.ObjectId) {
      roomData = await Room.findById(room).select("roles").lean();
    }
    
    if (!roomData?.roles) return false;
    
    const userRole = roomData.roles.find(
      role => role.user?.toString() === userId?.toString()
    );
    
    return userRole?.role === "admin" || userRole?.role === "moderator";
  } catch (error) {
    console.error("Error checking room moderator:", error);
    return false;
  }
};

/**
 * Get user's role in a room
 * 
 * @param {String} userId - User ID
 * @param {Object|String} room - Room object or room ID
 * @returns {String} - User's role (admin, moderator, member)
 */
const getUserRoleInRoom = async (userId, room) => {
  try {
    let roomData = room;
    
    if (typeof room === "string" || room instanceof mongoose.Types.ObjectId) {
      roomData = await Room.findById(room).select("roles").lean();
    }
    
    if (!roomData?.roles) return "member";
    
    const userRole = roomData.roles.find(
      role => role.user?.toString() === userId?.toString()
    );
    
    return userRole?.role || "member";
  } catch (error) {
    console.error("Error getting user role in room:", error);
    return "member";
      }
};

    /**
 * Check if a user is an admin for a call
 * Admin = Call initiator (caller) + callAdmins + Room admins
 * 
 * @param {String} userId - User ID
 * @param {Object|String} call - Call object or call ID
 * @param {Object|String} room - Room object or room ID (optional, will be fetched from call if not provided)
 * @returns {Boolean} - True if user is call admin
 */
const isCallAdmin = async (userId, call, room = null) => {
  try {
    let callData = call;
    let roomData = room;

    // If call is an ID, fetch it
    if (typeof call === "string" || call instanceof mongoose.Types.ObjectId) {
      callData = await Call.findById(call).select("caller callAdmins room").lean();
      }
    
    if (!callData) return false;
    
    const userIdStr = userId?.toString();
    
    // 1. Check if user is the caller (call initiator)
    if (callData.caller?.toString() === userIdStr) {
      return true;
    }

    // 2. Check if user is in callAdmins
    if (callData.callAdmins?.some(id => id?.toString() === userIdStr)) {
      return true;
    }

    // 3. Check if user is admin in the room
    if (!roomData && callData.room) {
      roomData = await Room.findById(callData.room).select("roles").lean();
      }
    
    if (roomData) {
      const isAdmin = await isRoomAdmin(userId, roomData);
      if (isAdmin) return true;
    }
    
    return false;
  } catch (error) {
    console.error("Error checking call admin:", error);
    return false;
  }
};

/**
 * Check if two users are friends
 * 
 * @param {String} userId1 - First user ID
 * @param {String} userId2 - Second user ID
 * @returns {Boolean} - True if they are friends
 */
const areUsersFriends = async (userId1, userId2) => {
  try {
    const user = await User.findById(userId1).select("friends").lean();
    return user?.friends?.some(id => id?.toString() === userId2?.toString()) || false;
  } catch (error) {
    console.error("Error checking friendship:", error);
    return false;
  }
};

/**
 * Check if a user is blocked by another user
 * 
 * @param {String} blockerId - User who may have blocked
 * @param {String} blockedId - User who may be blocked
 * @returns {Boolean} - True if blockedId is blocked by blockerId
 */
const isUserBlocked = async (blockerId, blockedId) => {
  try {
    const user = await User.findById(blockerId).select("blockedUsers").lean();
    return user?.blockedUsers?.some(id => id?.toString() === blockedId?.toString()) || false;
  } catch (error) {
    console.error("Error checking blocked status:", error);
    return false;
  }
};

/**
 * Check if any member in a room has blocked the user
 * 
 * @param {String} userId - User trying to interact
 * @param {String} roomId - Room ID
 * @returns {Object} - { isBlocked: Boolean, blockedBy: String[] }
 */
const checkBlockedInRoom = async (userId, roomId) => {
  try {
    const room = await Room.findById(roomId).select("members isGroup").lean();
    if (!room) return { isBlocked: false, blockedBy: [] };
    
    const userIdStr = userId?.toString();
    const blockedBy = [];
    
    // Check each member if they blocked this user
    for (const memberId of room.members) {
      const memberIdStr = memberId?.toString();
      if (memberIdStr === userIdStr) continue; // Skip self
      
      const blocked = await isUserBlocked(memberIdStr, userIdStr);
      if (blocked) {
        blockedBy.push(memberIdStr);
      }
    }
    
    return {
      isBlocked: blockedBy.length > 0,
      blockedBy,
    };
  } catch (error) {
    console.error("Error checking blocked in room:", error);
    return { isBlocked: false, blockedBy: [] };
  }
};

/**
 * Check permission based on settings array
 * 
 * @param {String} userId - User ID trying to perform the action
 * @param {Array} settings - Permission settings array (e.g., ["admin", "friends"])
 * @param {Object} options - Additional options
 * @param {Array} options.allowedUsers - Array of specifically allowed user IDs
 * @param {Array} options.exceptUsers - Array of specifically excluded user IDs (exceptions)
 * @param {Boolean} options.isAdmin - Whether user is admin (room or call)
 * @param {Boolean} options.isModerator - Whether user is moderator or higher
 * @param {Boolean} options.isFriend - Whether user is a friend
 * @param {String} options.ownerId - ID of the settings owner (for "noOne" check)
 * @param {Boolean} options.isGroupChat - Whether this is a group chat (affects noOne handling)
 * @param {Boolean} options.isOwner - Whether user is the owner (room.user or call.caller)
 * @returns {Boolean} - True if user has permission
 */
const checkPermissionFromSettings = (userId, settings, options = {}) => {
  const {
    allowedUsers = [],
    exceptUsers = [],
    isAdmin = false,
    isModerator = false,
    isFriend = false,
    ownerId = null,
    isGroupChat = false,
    isOwner = false,
  } = options;
  
  const userIdStr = userId?.toString();

  // Check if user is owner (either via isOwner flag or ownerId match)
  const userIsOwner = isOwner || (ownerId && userIdStr === ownerId?.toString());

  // ✅ Check if user is in exception list (except owner who always has access)
  // Exception list: users who are blocked from this permission even if they match other criteria
  if (!userIsOwner && exceptUsers.length > 0) {
    const exceptUserIds = exceptUsers.map(id => id?.toString());
    if (exceptUserIds.includes(userIdStr)) {
      return false; // User is explicitly excluded
    }
  }

  // If no settings configured, default to deny
  if (!settings || !Array.isArray(settings) || settings.length === 0) {
    // Owner can always access their own settings
    if (userIsOwner) {
      return true;
    }
    return false;
  }
  
  // Owner in group chats ALWAYS has permission (they created the group and control settings)
  if (isGroupChat && userIsOwner) {
    return true;
  }

  // Priority 1: "noOne" (Me Only) - only owner allowed
  if (settings.includes("noOne")) {
    // Only owner is allowed when "Me Only" is selected
    return userIsOwner;
  }
  
  // Priority 2: "everyone" - allows all (except those in exceptUsers, already checked above)
  if (settings.includes("everyone")) {
    return true;
  }
  
  // Priority 3: "admin" - allows owner + admins ONLY
  if (settings.includes("admin") && (userIsOwner || isAdmin)) {
    return true;
  }
  
  // Priority 4: "moderator" - allows owner + moderators ONLY (NOT admins)
  // Note: isModerator here means specifically the "moderator" role, not including admin
  if (settings.includes("moderator")) {
    // userIsOwner always allowed
    if (userIsOwner) return true;
    // Check if user has specifically the "moderator" role (not admin)
    // isModerator is true for both admin and moderator, so we need to exclude admin
    if (isModerator && !isAdmin) return true;
  }

  // Priority 5: "friends"
  if (settings.includes("friends")) {
    // Owner always has access to their own group
    if (userIsOwner || isFriend) {
      return true;
    }
  }

  // Priority 6: "specific" users
  if (settings.includes("specific")) {
    const allowedUserIds = allowedUsers.map(id => id?.toString());
    if (allowedUserIds.includes(userIdStr) || userIsOwner) {
      return true;
    }
  }
  
  return false;
};

/**
 * Check if a user has permission for a specific chat action
 * Uses Room.chatSettings as the source of truth
 * 
 * @param {String} userId - User ID trying to perform the action
 * @param {String} roomId - Room ID
 * @param {String} setting - Setting name (videoCall, audioCall, canSend)
 * @returns {Boolean} - True if user has permission
 */
const checkChatPermission = async (userId, roomId, setting) => {
  try {
    if (!userId || !roomId || !setting) {
      console.warn("checkChatPermission: Missing required parameters");
      return false;
    }
    
    // Fetch room with chatSettings, roles, and members populated
    const room = await Room.findById(roomId)
      .select("chatSettings roles members isGroup user")
      .populate("members", "privacySettings friends")
      .lean();
    
    if (!room) {
      console.warn("checkChatPermission: Room not found");
      return false;
    }
    
    const userIdStr = userId?.toString();
    const isGroupChat = room.isGroup === true;
    
    let settingValue, allowedUsers, exceptUsers, ownerId, isFriend;
    
    // ✅ For PRIVATE CHATS: use the OTHER user's privacy settings
    if (!isGroupChat) {
      // Find the other user in the room
      const otherUser = room.members?.find(
        m => m?._id?.toString() !== userIdStr && String(m?._id) !== userIdStr
      );
      
      if (!otherUser) {
        // No other user found, allow
        return true;
      }
      
      // Use the other user's defaultChatSettings
      settingValue = otherUser.privacySettings?.defaultChatSettings?.[setting] || [];
      allowedUsers = otherUser.privacySettings?.defaultChatSettings?.[`${setting}AllowedUsers`] || [];
      exceptUsers = otherUser.privacySettings?.defaultChatSettings?.[`${setting}ExceptUsers`] || [];
      ownerId = otherUser._id;
      
      // If no settings configured, allow
      if (settingValue.length === 0) {
        return true;
      }
      
      // Check if current user is friend of the other user
      isFriend = await areUsersFriends(userId, otherUser._id);
      
      return checkPermissionFromSettings(userId, settingValue, {
        allowedUsers,
        exceptUsers,
        isAdmin: false, // No admin in private chats
        isModerator: false,
        isFriend,
        ownerId,
        isGroupChat: false,
        isOwner: false, // In private chats, we check the OTHER user's settings
      });
    }
    
    // ✅ For GROUP CHATS: use Room.chatSettings
    settingValue = room.chatSettings?.[setting] || [];
    allowedUsers = room.chatSettings?.[`${setting}AllowedUsers`] || [];
    exceptUsers = room.chatSettings?.[`${setting}ExceptUsers`] || [];
    
    // If no settings configured for group, default to everyone
    if (settingValue.length === 0) {
      return true;
    }

    // Get user's role and check if admin/moderator
    const userRole = await getUserRoleInRoom(userId, room);
    const isAdmin = userRole === "admin";
    const isModerator = userRole === "moderator" || userRole === "admin";
    
    // Check if user is the room owner
    const isOwner = room.user?.toString() === userIdStr;
    
    // Check if user is friend of ANY admin in the group
    isFriend = false;
    if (room.roles) {
      const adminIds = room.roles
        .filter(role => role.role === "admin")
        .map(role => role.user?.toString());
      
      for (const adminId of adminIds) {
        if (adminId && await areUsersFriends(userId, adminId)) {
          isFriend = true;
          break;
        }
      }
    }
    
    return checkPermissionFromSettings(userId, settingValue, {
      allowedUsers,
      exceptUsers,
      isAdmin,
      isModerator,
      isFriend,
      ownerId: room.user,
      isGroupChat: true,
      isOwner,
    });
  } catch (error) {
    console.error("Error checking chat permission:", error);
    return false;
  }
};

/**
 * Check if a user has permission for a specific call action
 * Uses Call.callSettings as the source of truth
 * 
 * @param {String} userId - User ID trying to perform the action
 * @param {String} callId - Call ID
 * @param {String} setting - Setting name (screenShare, recording, callTransfer, liveStream, endCallForAll)
 * @returns {Boolean} - True if user has permission
 */
const checkCallPermission = async (userId, callId, setting) => {
  try {
    if (!userId || !callId || !setting) {
      console.warn("checkCallPermission: Missing required parameters");
      return false;
    }
    
    // Fetch call with callSettings
    const call = await Call.findById(callId)
      .select("callSettings caller callAdmins room")
      .lean();
    
    if (!call) {
      console.warn("checkCallPermission: Call not found");
      return false;
    }
    
    // Get the setting value
    const rawSettingValue = call.callSettings?.[setting] || [];
    const settingValue = Array.isArray(rawSettingValue)
      ? rawSettingValue
      : rawSettingValue
        ? [rawSettingValue]
        : [];
    const allowedUsers = Array.isArray(call.callSettings?.[`${setting}AllowedUsers`])
      ? call.callSettings[`${setting}AllowedUsers`]
      : [];
    const exceptUsers = Array.isArray(call.callSettings?.[`${setting}ExceptUsers`])
      ? call.callSettings[`${setting}ExceptUsers`]
      : [];
    
    // If no settings configured, use defaults (legacy-safe behavior)
    if (settingValue.length === 0) {
      // Call initiator always has permission
      if (call.caller?.toString() === userId?.toString()) {
        return true;
      }
      // Default based on setting type
      if (setting === "screenShare") return true;
      // Legacy compatibility for end-for-all when setting was not configured
      if (setting === "endCallForAll") return false;
      return false; // More secure default for recording, liveStream, etc.
    }
    
    // Get room for role checking and owner-based overrides
    const room = await Room.findById(call.room).select("roles isGroup user").lean();
    const isGroupChat = room?.isGroup === true;
    
    // Check if user is call admin
    const isAdmin = await isCallAdmin(userId, call, room);
    
    // Check if user is moderator in room
    const isModerator = await isRoomModerator(userId, room);
    
    // Check friendship with caller
    const isFriend = await areUsersFriends(userId, call.caller);
    
    // Owner reference:
    // - For endCallForAll: room owner controls this setting
    // - Other call settings: call initiator remains the owner
    const ownerIdForSetting =
      setting === "endCallForAll"
        ? room?.user || call.caller
        : call.caller;
    const isOwner = ownerIdForSetting?.toString() === userId?.toString();
    
    return checkPermissionFromSettings(userId, settingValue, {
      allowedUsers,
      exceptUsers,
      isAdmin,
      isModerator,
      isFriend,
      ownerId: ownerIdForSetting,
      isGroupChat, // ✅ Pass isGroupChat for proper admin handling in groups
      isOwner,
    });
  } catch (error) {
    console.error("Error checking call permission:", error);
    return false;
  }
};

/**
 * Copy default settings from user to room when creating a new room
 * 
 * @param {String} userId - User ID (room creator)
 * @param {Object} roomData - Room data to update
 * @returns {Object} - Room data with copied settings
 */
const copyDefaultChatSettingsToRoom = async (userId, roomData = {}) => {
  try {
    const user = await User.findById(userId)
      .select("privacySettings.defaultChatSettings")
      .lean();
    
    if (user?.privacySettings?.defaultChatSettings) {
      roomData.chatSettings = { ...user.privacySettings.defaultChatSettings };
    }
    
    return roomData;
  } catch (error) {
    console.error("Error copying default chat settings:", error);
    return roomData;
  }
};

/**
 * Copy default settings from user to call when creating a new call
 * 
 * @param {String} userId - User ID (call initiator)
 * @param {Object} callData - Call data to update
 * @returns {Object} - Call data with copied settings
 */
const copyDefaultCallSettingsToCall = async (userId, callData = {}) => {
  try {
    // Prefer room-level pre-call settings (shared) when available
    if (callData?.room) {
      const room = await Room.findById(callData.room)
        .select("callSettings")
        .lean();
      if (room?.callSettings && Object.keys(room.callSettings).length > 0) {
        callData.callSettings = { ...room.callSettings };
        return callData;
      }
    }

    const user = await User.findById(userId)
      .select("privacySettings.defaultCallSettings")
      .lean();
    
    if (user?.privacySettings?.defaultCallSettings) {
      callData.callSettings = { ...user.privacySettings.defaultCallSettings };
    }
    
    return callData;
  } catch (error) {
    console.error("Error copying default call settings:", error);
    return callData;
  }
};

/**
 * Validate permission settings array
 * 
 * @param {Array} settings - Settings array to validate
 * @returns {Array} - Validated settings array
 */
const validatePermissionSettings = (settings) => {
  if (!Array.isArray(settings)) {
    return [];
  }
  return settings.filter(s => VALID_PERMISSION_VALUES.includes(s));
};

/**
 * Check if user can modify room chat settings (must be admin)
 * 
 * @param {String} userId - User ID
 * @param {String} roomId - Room ID
 * @returns {Boolean} - True if user can modify
 */
const canModifyRoomChatSettings = async (userId, roomId) => {
  return await isRoomAdmin(userId, roomId);
};

/**
 * Check if user can modify call settings (must be call admin)
 * 
 * @param {String} userId - User ID
 * @param {String} callId - Call ID
 * @returns {Boolean} - True if user can modify
 */
const canModifyCallSettings = async (userId, callId) => {
  return await isCallAdmin(userId, callId);
};

/**
 * Check if a user has a specific admin permission in a room
 * 
 * @param {String} userId - User ID
 * @param {Object} room - Room object with adminPermissions and roles
 * @param {String} permission - Permission name (canKickMembers, canDeleteMessages, etc.)
 * @returns {Boolean} - True if user has the permission
 */
const checkAdminPermission = async (userId, roomId, permission) => {
  try {
    if (!userId || !roomId || !permission) {
      return false;
    }
    
    const room = await Room.findById(roomId)
      .select("adminPermissions roles user isGroup")
      .lean();
    
    if (!room) {
      return false;
    }
    
    // Owner always has all permissions
    const userIdStr = userId?.toString();
    const isOwner = room.user?.toString() === userIdStr;
    
    if (isOwner) {
      return true;
    }
    
    // For non-group chats, only owner matters
    if (!room.isGroup) {
      return false;
    }
    
    // Get user's role
    const userRole = await getUserRoleInRoom(userId, room);
    
    // Get permission settings
    const permissionConfig = room.adminPermissions?.[permission];
    
    // If permission config doesn't exist, use defaults
    if (!permissionConfig) {
      // Default: only admins have permissions
      return userRole === "admin";
    }
    
    // Check if permission is enabled
    if (!permissionConfig.enabled) {
      return false;
    }
    
    // Check if user's role is in the allowed roles
    const allowedRoles = permissionConfig.roles || ["admin"];
    return allowedRoles.includes(userRole);
  } catch (error) {
    console.error("Error checking admin permission:", error);
    return false;
  }
};

/**
 * Synchronous version of checkAdminPermission (for use when room is already loaded)
 */
const checkAdminPermissionSync = (userId, room, permission) => {
  try {
    if (!userId || !room || !permission) {
      return false;
    }
    
    // Owner always has all permissions
    const userIdStr = userId?.toString();
    const isOwner = room.user?.toString() === userIdStr ||
                    String(room.user) === userIdStr ||
                    room.user?._id?.toString() === userIdStr;
    if (isOwner) {
      return true;
    }
    
    // For non-group chats, only owner matters
    if (!room.isGroup) {
      return false;
    }
    
    // Get user's role from already-loaded room object (sync-safe)
    const userRoleEntry = (room.roles || []).find(
      (role) =>
        role?.user?.toString?.() === userIdStr ||
        String(role?.user) === userIdStr ||
        role?.user?._id?.toString?.() === userIdStr
    );
    const userRole = userRoleEntry?.role || "member";
    
    // Get permission settings
    const permissionConfig = room.adminPermissions?.[permission];
    
    // If permission config doesn't exist, use defaults
    if (!permissionConfig) {
      // Default: only admins have permissions
      return userRole === "admin";
    }
    
    // Check if permission is enabled
    if (!permissionConfig.enabled) {
      return false;
    }
    
    // Check if user's role is in the allowed roles
    const allowedRoles = permissionConfig.roles || ["admin"];
    return allowedRoles.includes(userRole);
  } catch (error) {
    console.error("Error checking admin permission:", error);
    return false;
  }
};

module.exports = {
  // Role checking
  isRoomAdmin,
  isRoomModerator,
  isCallAdmin,
  getUserRoleInRoom,
  areUsersFriends,
  
  // Blocked users checking
  isUserBlocked,
  checkBlockedInRoom,
  
  // Permission checking
  checkChatPermission,
  checkCallPermission,
  checkPermissionFromSettings,
  checkAdminPermission,
  checkAdminPermissionSync,
  
  // Settings management
  copyDefaultChatSettingsToRoom,
  copyDefaultCallSettingsToCall,
  validatePermissionSettings,
  canModifyRoomChatSettings,
  canModifyCallSettings,
  
  // Constants
  VALID_PERMISSION_VALUES,
};
