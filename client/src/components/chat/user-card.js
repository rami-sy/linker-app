import { View, Text, TouchableOpacity } from "react-native";
import React from "react";
import UserImage from "../user-image";
import UserName from "../user-name";

import FeIcon from "react-native-vector-icons/Feather";
import Icon from "react-native-vector-icons/Ionicons";
import { useSelector } from "react-redux";
import { router } from "expo-router";
import { useColorScheme } from "../../../lib/useColorScheme";
import ContextMenu from "../context-menu";
import RoleBadge from "./role-badge";

/**
 * UserCard - Reusable user card component for displaying user info with role badge
 * 
 * @param {Object} item - User object
 * @param {Object} room - Room object
 * @param {Function} onMessagePress - Callback when message icon is pressed
 * @param {boolean} showMessageIcon - Whether to show message icon (default: false)
 * @param {boolean} showContextMenu - Whether to show context menu (default: false)
 * @param {string} role - User role in the room
 * @param {boolean} isOwner - Whether this user is the room owner
 * @param {Object} contextMenuProps - Props for context menu if shown
 * @param {Function} onPress - Callback when card is pressed
 */
const UserCard = ({
  item,
  room,
  onMessagePress,
  showMessageIcon = false,
  showContextMenu = false,
  role,
  isOwner = false,
  contextMenuProps = {},
  onPress,
  onCloseModal,
  /** Optional second line under the name (e.g. call status). */
  subtitle,
  subtitleClassName,
  /** Small pill/badge after the name (e.g. “Caller”). */
  nameBadge,
  /** Extra classes on the outer row (e.g. mb-2). */
  className = "",
}) => {
  const { isDarkColorScheme } = useColorScheme();
  const { user: currentUser } = useSelector((state) => state.users);

  // Determine the role to display
  const displayRole = isOwner
    ? "owner"
    : role === "admin"
      ? "admin"
      : role === "moderator"
        ? "moderator"
        : "member";

  const isCurrentUser = String(currentUser?._id) === String(item?._id);

  const handleProfilePress = () => {
    if (onCloseModal) onCloseModal();
    router.push({
      pathname: `/profile/${item?._id}`,
      params: { from: `chats/${room?._id}` },
    });
  };

  const subtitleDefault =
    "text-xs text-slate-500 dark:text-slate-400 mt-0.5";

  return (
    <View
      className={`flex-row items-center w-full px-2 min-h-14 py-1.5 bg-white dark:bg-slate-800/50 rounded-xl ${className}`}
    >
      <UserImage
        onPress={onPress || handleProfilePress}
        size="h-12 w-12"
        border="border-0"
        user={item}
      />

      <View className="flex-row items-center justify-between flex-1 ml-3">
        <View className="flex-col flex-1 mr-2">
          <View className="flex-row items-center flex-wrap gap-x-2">
            {nameBadge}
            <RoleBadge role={displayRole} size="sm" />
            <UserName
              className="text-slate-700 dark:text-slate-300"
              onPress={onPress || handleProfilePress}
              user={item}
              onlyFirst={true}
            />
            {isCurrentUser && (
              <Text className="text-xs text-slate-500 dark:text-slate-400">
                (You)
              </Text>
            )}
          </View>
          {!!subtitle && (
            <Text
              className={
                subtitleClassName?.trim()
                  ? subtitleClassName
                  : subtitleDefault
              }
            >
              {subtitle}
            </Text>
          )}
        </View>

        <View className="flex-row items-center justify-end gap-x-1 shrink-0">
          {/* Message Icon */}
          {showMessageIcon && !isCurrentUser && onMessagePress && (
            <TouchableOpacity
              onPress={() => onMessagePress(item)}
              className="items-center justify-center p-2"
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon
                name="chatbubble-outline"
                size={20}
                color={isDarkColorScheme ? "#93c5fd" : "#3b82f6"}
              />
            </TouchableOpacity>
          )}

          {/* Context Menu */}
          {showContextMenu && contextMenuProps.options?.length > 0 && (
            <ContextMenu
              options={contextMenuProps.options}
              placement={contextMenuProps.placement || "left"}
              width={contextMenuProps.width || 180}
            >
              <View className="items-center justify-center p-2">
                <FeIcon
                  name="more-vertical"
                  size={20}
                  color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
                />
              </View>
            </ContextMenu>
          )}
        </View>
      </View>
    </View>
  );
};

export default UserCard;
