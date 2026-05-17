import React from "react";
import { I18nManager, Text, TouchableOpacity, View } from "react-native";
import UserImage from "../user-image";
import UserName from "../user-name";

const variantStyle = {
  list: "px-2 py-1.5 rounded-xl",
  card: "px-3 py-2 rounded-2xl",
  compact: "px-1 py-1 rounded-lg",
  modal: "px-2.5 py-2 rounded-xl",
};

const UserDisplay = ({
  user,
  room = null,
  roleBadge = null,
  statusText = "",
  secondaryText = "",
  primaryClassName = "",
  secondaryClassName = "",
  showStatusDot = true,
  showAvatar = true,
  imageSize = "h-12 w-12",
  imageBorder = "border-0",
  imageRounded = "rounded-full",
  imageStatusColor = null,
  variant = "list",
  selected = false,
  disabled = false,
  rtl = I18nManager.isRTL,
  onPress = null,
  onAvatarPress = null,
  actions = null,
  onlyFirst = true,
  maxLength = 18,
  className = "",
}) => {
  const Container = onPress ? TouchableOpacity : View;
  const surface = selected
    ? "bg-slate-100 dark:bg-slate-800"
    : "bg-transparent";

  return (
    <Container
      onPress={onPress}
      disabled={disabled}
      className={`w-full flex-row items-center justify-between ${variantStyle[variant] || variantStyle.list} ${surface} ${className}`}
      activeOpacity={onPress ? 0.85 : 1}
    >
      <View className={`flex-row items-center flex-1 ${rtl ? "flex-row-reverse" : ""}`}>
        {showAvatar ? (
          <UserImage
            user={user}
            size={imageSize}
            border={imageBorder}
            rounded={imageRounded}
            showStatus={showStatusDot}
            statusColor={imageStatusColor}
            onPress={onAvatarPress}
          />
        ) : null}
        <View
          className={`${showAvatar ? (rtl ? "mr-2.5" : "ml-2.5") : ""} ${rtl ? "items-end" : "items-start"} flex-1`}
        >
          <View className={`flex-row items-center ${rtl ? "flex-row-reverse" : ""}`}>
            <UserName
              user={user}
              onlyFirst={onlyFirst}
              maxLength={maxLength}
              className={`text-slate-800 dark:text-slate-100 ${primaryClassName}`}
            />
            {roleBadge}
          </View>
          {!!statusText && (
            <Text className={`text-xs text-chatAccent mt-0.5 ${secondaryClassName}`}>
              {statusText}
            </Text>
          )}
          {!statusText && !!secondaryText && (
            <Text className={`text-xs text-slate-500 dark:text-slate-400 mt-0.5 ${secondaryClassName}`}>
              {secondaryText}
            </Text>
          )}
        </View>
      </View>
      {actions ? <View className={`flex-row items-center gap-x-2`}>{actions}</View> : null}
    </Container>
  );
};

export default UserDisplay;
