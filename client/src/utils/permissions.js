/**
 * Client-side Permission Checking Utilities
 * 
 * Helper functions to check call and chat permissions on the client side
 * 
 * Architecture:
 * - Room.chatSettings = Active chat settings (highest priority for chat actions)
 * - Call.callSettings = Active call settings (highest priority for in-call actions)
 * - User.defaultChatSettings / User.defaultCallSettings = Default settings for new rooms/calls
 */

/**
 * Valid permission values
 */
export const VALID_PERMISSION_VALUES = ["everyone", "admin", "moderator", "friends", "specific", "noOne"];

/**
 * Check if a user is the owner of a room
 * Handles both populated and unpopulated room.user
 * 
 * @param {String} userId - User ID to check
 * @param {Object} room - Room object with user field
 * @returns {Boolean} - True if user is the room owner
 */
export const isRoomOwner = (userId, room) => {
  if (!userId || !room?.user) return false;
  
  const userIdStr = String(userId);
  
  // Handle both populated and unpopulated room.user
  return room.user?.toString() === userIdStr || 
         String(room.user) === userIdStr ||
         room.user?._id?.toString() === userIdStr ||
         String(room.user?._id) === userIdStr;
};

/**
 * Check if a user is an admin in a room
 * 
 * @param {String} userId - User ID
 * @param {Object} room - Room object with roles array
 * @returns {Boolean} - True if user is admin
 */
export const isRoomAdmin = (userId, room) => {
  if (!room?.roles || !Array.isArray(room.roles)) return false;
  
  const userRole = room.roles.find(
    role => role.user?.toString() === String(userId) || String(role.user) === String(userId)
      );
  
  return userRole?.role === "admin";
};

/**
 * Check if a user is a moderator or higher in a room
 * 
 * @param {String} userId - User ID
 * @param {Object} room - Room object with roles array
 * @returns {Boolean} - True if user is moderator or admin
 */
export const isRoomModerator = (userId, room) => {
  if (!room?.roles || !Array.isArray(room.roles)) return false;
  
  const userRole = room.roles.find(
    role => role.user?.toString() === String(userId) || String(role.user) === String(userId)
  );
  
  return userRole?.role === "admin" || userRole?.role === "moderator";
};

/**
 * Get user's role in a room
 * 
 * @param {String} userId - User ID
 * @param {Object} room - Room object with roles array
 * @returns {String} - User's role (admin, moderator, member)
 */
export const getUserRoleInRoom = (userId, room) => {
  try {
    if (!room || !room.roles || !Array.isArray(room.roles)) {
      return "member";
    }

    const userRole = room.roles.find(
      (role) => role.user?.toString() === String(userId) || String(role.user) === String(userId)
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
 * @param {Object} call - Call object with caller, callAdmins
 * @param {Object} room - Room object with roles (optional)
 * @returns {Boolean} - True if user is call admin
 */
export const isCallAdmin = (userId, call, room = null) => {
  if (!call) return false;
  
  const userIdStr = String(userId);
  
  // 1. Check if user is the caller (call initiator)
  if (call.caller?.toString() === userIdStr || String(call.caller) === userIdStr) {
    return true;
  }
  
  // 2. Check if user is in callAdmins
  if (call.callAdmins?.some(id => id?.toString() === userIdStr || String(id) === userIdStr)) {
    return true;
  }
  
  // 3. Check if user is admin in the room
  if (room) {
    return isRoomAdmin(userId, room);
  }
  
  return false;
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
 * @param {Boolean} options.isOwner - Whether user is the owner (room.user or call.caller)
 * @returns {Boolean} - True if user has permission
 */
export const checkPermissionFromSettings = (userId, settings, options = {}) => {
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
  
  const userIdStr = String(userId);
  
  // Check if user is owner (either via isOwner flag or ownerId match)
  const userIsOwner = isOwner || (ownerId && userIdStr === String(ownerId));
  
  // ✅ Check if user is in exception list (except owner who always has access)
  // Exception list: users who are blocked from this permission even if they match other criteria
  if (!userIsOwner && exceptUsers.length > 0) {
    const exceptUserIds = exceptUsers.map(id => id?.toString ? id.toString() : String(id));
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
    const allowedUserIds = allowedUsers.map(id => id?.toString ? id.toString() : String(id));
    if (allowedUserIds.includes(userIdStr) || userIsOwner) {
      return true;
    }
  }
  
  return false;
};

/**
 * Check if a user has permission for a specific chat action
 * 
 * For GROUP chats: Uses Room.chatSettings as the source of truth
 * For PRIVATE chats: Uses otherUser.privacySettings.defaultChatSettings
 * 
 * @param {String} userId - User ID trying to perform the action
 * @param {Object} room - Room object with chatSettings and roles
 * @param {String} setting - Setting name (videoCall, audioCall, canSend)
 * @param {Object} options - Additional options
 * @param {Object} options.currentUser - Current user object (for friend checking)
 * @param {Object} options.otherUser - Other user in private chat (for getting their settings)
 * @returns {Boolean} - True if user has permission
 */
export const checkChatPermission = (userId, room, setting, options = {}) => {
  try {
    if (!userId || !room || !setting) {
      return false;
    }
    
    const { currentUser = null, otherUser = null } = options;
    const userIdStr = String(userId);
    
    // Determine if this is a group chat or private chat
    const isGroupChat = room.isGroup === true;
    
    let settingValue = [];
    let allowedUsers = [];
    let ownerId = null;
    let isFriend = false;
    let isAdmin = false;
    let isModerator = false;
    
    // Check if user is the room owner
    const isOwner = room.user?.toString() === userIdStr || 
                    String(room.user) === userIdStr ||
                    room.user?._id?.toString() === userIdStr;
    
    // Variable to hold exception users
    let exceptUsers = [];
    
    if (isGroupChat) {
      // GROUP CHAT: Use room.chatSettings
      settingValue = room.chatSettings?.[setting] || [];
      allowedUsers = room.chatSettings?.[`${setting}AllowedUsers`] || [];
      exceptUsers = room.chatSettings?.[`${setting}ExceptUsers`] || [];
      ownerId = room.user?._id || room.user;
      
      // Get user's role in group
      const userRole = getUserRoleInRoom(userId, room);
      isAdmin = userRole === "admin";
      isModerator = userRole === "moderator" || userRole === "admin";
      
      // Friends check: In groups, check if user is friend of the owner OR any admin
      if (currentUser?.friends) {
        const ownerIdStr = String(ownerId);
        
        // Check if friend of owner
        isFriend = currentUser.friends.some(
          friendId => friendId?.toString() === ownerIdStr || String(friendId) === ownerIdStr
        );
        
        // Also check if friend of any admin (if not already friend of owner)
        if (!isFriend && room.roles) {
          const adminIds = room.roles
            .filter(role => role.role === "admin")
            .map(role => role.user?._id || role.user);
          
          isFriend = adminIds.some(adminId => {
            if (!adminId) return false;
            return currentUser.friends.some(
              friendId => friendId?.toString() === String(adminId) || String(friendId) === String(adminId)
            );
          });
        }
      }
    } else {
      // PRIVATE CHAT: Use otherUser.privacySettings.defaultChatSettings
      if (!otherUser) {
        // If no otherUser provided, try to find from room members
        const roomOtherUser = room.members?.find(
          m => (m?._id?.toString() !== userIdStr && String(m?._id) !== userIdStr && String(m) !== userIdStr)
        );
        if (roomOtherUser) {
          settingValue = roomOtherUser.privacySettings?.defaultChatSettings?.[setting] || [];
          allowedUsers = roomOtherUser.privacySettings?.defaultChatSettings?.[`${setting}AllowedUsers`] || [];
          exceptUsers = roomOtherUser.privacySettings?.defaultChatSettings?.[`${setting}ExceptUsers`] || [];
          ownerId = roomOtherUser._id;
          
          // Check if current user is friend of other user
          if (currentUser?.friends) {
            isFriend = currentUser.friends.some(
              friendId => friendId?.toString() === String(roomOtherUser._id) || String(friendId) === String(roomOtherUser._id)
            );
          }
        } else {
          // No other user found, default to allow
          return true;
        }
      } else {
        // Use provided otherUser's settings
        settingValue = otherUser.privacySettings?.defaultChatSettings?.[setting] || [];
        allowedUsers = otherUser.privacySettings?.defaultChatSettings?.[`${setting}AllowedUsers`] || [];
        exceptUsers = otherUser.privacySettings?.defaultChatSettings?.[`${setting}ExceptUsers`] || [];
        ownerId = otherUser._id;
        
        // Check if current user is friend of other user
        if (currentUser?.friends) {
          isFriend = currentUser.friends.some(
            friendId => friendId?.toString() === String(otherUser._id) || String(friendId) === String(otherUser._id)
          );
        }
      }
      
      // No admin/moderator roles in private chats
      isAdmin = false;
      isModerator = false;
    }
    
    // If no settings configured, default to allow for everyone
    if (!Array.isArray(settingValue) || settingValue.length === 0) {
      return true;
    }
    
    return checkPermissionFromSettings(userId, settingValue, {
      allowedUsers,
      exceptUsers,
      isAdmin,
      isModerator,
      isFriend,
      ownerId,
      isGroupChat,
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
 * @param {Object} call - Call object with callSettings, caller, callAdmins
 * @param {String} setting - Setting name (screenShare, recording, callTransfer, liveStream)
 * @param {Object} options - Additional options (room for role checking, currentUser for friend checking)
 * @returns {Boolean} - True if user has permission
 */
export const checkCallPermission = (userId, call, setting, options = {}) => {
  try {
    if (!userId || !call || !setting) {
      return false;
    }
    
    const { room = null, currentUser = null } = options;
    
    // Get the setting value from call
    const settingValue = call.callSettings?.[setting] || [];
    const allowedUsers = call.callSettings?.[`${setting}AllowedUsers`] || [];
    const exceptUsers = call.callSettings?.[`${setting}ExceptUsers`] || [];
    
    // If no settings configured, use defaults
    if (!Array.isArray(settingValue) || settingValue.length === 0) {
      // Call initiator always has permission
      if (call.caller?.toString() === String(userId) || String(call.caller) === String(userId)) {
        return true;
      }
      // Default based on setting type
      if (setting === "screenShare") return true;
      return false; // More secure default for recording, liveStream, etc.
    }
    
    // Check if user is call admin
    const isAdmin = isCallAdmin(userId, call, room);
    
    // Check if user is moderator in room
    const isModerator = room ? isRoomModerator(userId, room) : false;
    
    // Check friendship with caller
    let isFriend = false;
    if (currentUser?.friends && call.caller) {
      isFriend = currentUser.friends.some(
        friendId => friendId?.toString() === String(call.caller) || String(friendId) === String(call.caller)
      );
    }
    
    // Check if user is the call initiator (owner of the call)
    const userIdStr = String(userId);
    const isOwner = call.caller?.toString() === userIdStr || String(call.caller) === userIdStr;
    
    return checkPermissionFromSettings(userId, settingValue, {
      allowedUsers,
      exceptUsers,
      isAdmin,
      isModerator,
      isFriend,
      ownerId: call.caller,
      isOwner,
    });
  } catch (error) {
    console.error("Error checking call permission:", error);
    return false;
  }
};

/**
 * Get display text for permission setting
 * 
 * @param {Array|String} settings - Setting value(s)
 * @param {Function} t - Translation function
 * @returns {String} - Display text
 */
export const getPermissionDisplayText = (settings, t) => {
  const valueArray = Array.isArray(settings) ? settings : (settings ? [settings] : []);
  
  if (valueArray.length === 0) {
    return t?.("permissions.everyone") || "Everyone";
  }
  
  const labels = valueArray.map(v => {
    switch(v) {
      case "everyone": return t?.("permissions.everyone") || "Everyone";
      case "admin": return t?.("permissions.admin") || "Admins";
      case "moderator": return t?.("permissions.moderator") || "Moderators";
      case "friends": return t?.("permissions.friends") || "Friends";
      case "specific": return t?.("permissions.specific") || "Specific Users";
      case "noOne": return t?.("permissions.noOne") || "Me Only";
      default: return v;
    }
  });
  
  return labels.join(", ");
};

/**
 * Validate permission settings array
 * 
 * @param {Array} settings - Settings array to validate
 * @returns {Array} - Validated settings array
 */
export const validatePermissionSettings = (settings) => {
  if (!Array.isArray(settings)) {
    return [];
  }
  return settings.filter(s => VALID_PERMISSION_VALUES.includes(s));
};

/**
 * Check if user can modify room chat settings
 * Uses canModifyChatSettings permission - default: only owner
 * 
 * @param {String} userId - User ID
 * @param {Object} room - Room object
 * @returns {Boolean} - True if user can modify
 */
export const canModifyRoomChatSettings = (userId, room) => {
  // For private chats, both users can modify their own settings (handled separately)
  if (!room?.isGroup) {
    return room?.members?.some(
      m => m?._id?.toString() === String(userId) || String(m?._id) === String(userId) || String(m) === String(userId)
    );
  }
  
  // ✅ Check if user is owner (always has permission)
  if (isRoomOwner(userId, room)) {
    return true;
  }
  
  // ✅ Check canModifyChatSettings permission for admins/moderators
  return checkAdminPermission(userId, room, "canModifyChatSettings");
};

/**
 * Check if user can modify call settings
 * Uses canModifyCallSettings permission - default: only caller/owner
 * 
 * @param {String} userId - User ID
 * @param {Object} call - Call object
 * @param {Object} room - Room object (optional)
 * @returns {Boolean} - True if user can modify
 */
export const canModifyCallSettings = (userId, call, room = null) => {
  // ✅ Caller always has permission
  const userIdStr = String(userId);
  if (call?.caller?.toString() === userIdStr || String(call?.caller) === userIdStr) {
    return true;
  }
  
  // ✅ Room owner always has permission
  if (room && isRoomOwner(userId, room)) {
    return true;
  }
  
  // ✅ Check canModifyCallSettings permission for admins/moderators
  if (room?.isGroup) {
    return checkAdminPermission(userId, room, "canModifyCallSettings");
  }
  
  return false;
};

/**
 * Check if user can modify auto-delete timer (disappearing messages)
 * Uses canModifyAutoDelete permission - default: only owner
 * 
 * @param {String} userId - User ID
 * @param {Object} room - Room object
 * @returns {Boolean} - True if user can modify
 */
export const canModifyAutoDelete = (userId, room) => {
  // ✅ Owner always has permission
  if (isRoomOwner(userId, room)) {
    return true;
  }
  
  // ✅ Check canModifyAutoDelete permission for admins/moderators
  if (room?.isGroup) {
    return checkAdminPermission(userId, room, "canModifyAutoDelete");
  }
  
  return false;
};

/**
 * Check if a user has a specific admin permission in a room
 * 
 * @param {String} userId - User ID
 * @param {Object} room - Room object with adminPermissions and roles
 * @param {String} permission - Permission name (canKickMembers, canDeleteMessages, etc.)
 * @returns {Boolean} - True if user has the permission
 */
export const checkAdminPermission = (userId, room, permission) => {
  try {
    if (!userId || !room || !permission) {
      return false;
    }
    
    // Owner always has all permissions
    const userIdStr = String(userId);
    const isOwner = isRoomOwner(userId, room);
    if (isOwner) {
      return true;
    }
    
    // For non-group chats, only owner matters
    if (!room?.isGroup) {
      return false;
    }
    
    // Get user's role
    const userRole = getUserRoleInRoom(userId, room);
    
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

/** Who may pin/unpin in this room: admins/moderators per settings in groups; both sides in DMs */
export const canPinInRoom = (userId, room) => {
  if (!userId || !room) return false;
  if (room.isGroup) {
    return checkAdminPermission(userId, room, "canPinMessages");
  }
  const uid = String(userId);
  const inMembers = (room.members || []).some(
    (m) => String(m?._id || m) === uid
  );
  return inMembers || isRoomOwner(userId, room);
};
