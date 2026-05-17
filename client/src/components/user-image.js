import { View, Text, Image, TouchableOpacity } from "react-native";
import React, { memo } from "react";
import { useSelector } from "react-redux";
import ImagePlaceholder from "./image-placeholder";
import Constants from "expo-constants";
import { useColorScheme } from "~/lib/useColorScheme";

const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig.extra.EXPO_PUBLIC_API_URL;   

  function isValidHex6(color) {
    return typeof color === "string" && /^#([0-9A-Fa-f]{6})$/.test(color.trim());
  }
const UserImage = memo(
  ({
    user = null,
    size = "w-8 h-8",
    border = "border-4",
    text = "text-lg font-bold",
    rounded = "rounded-full",
    show = true,
    onPress = null,
    showStatus = true,
    statusSize = "w-4 h-4",
    style = {},
    resizeMode = "cover",
    children,
    p = "p-0",
    overflow = "overflow-auto",
    showLevel = false,
    statusColor = null,
    borderWidth = 3,
  }) => {
    const { user: currentUser } = useSelector((state) => state.users);
    // ✅ Use provided user if available, otherwise fallback to currentUser
    const targetUser = user || currentUser;
    const { isDarkColorScheme } = useColorScheme();
    const Container = onPress ? TouchableOpacity : View;
    // ✅ Extract color from colors array (first color's code)
    const userColor = targetUser?.colors?.length > 0 && targetUser.colors[0]?.code 
      ? targetUser.colors[0].code 
      : null;
    const validColor = isValidHex6(userColor) ? userColor : null;
    
    // ✅ Check if user has valid images (with path)
    const hasValidImages = targetUser?.images?.length > 0 && 
                           targetUser.images.some(img => img?.path);
    const firstImagePath = targetUser?.images?.find(img => img?.path)?.path || 
                          targetUser?.images?.[0]?.path;
    
    // ✅ Debug log for stream chat overlay
    if (__DEV__ && targetUser) {
      console.log("🎨 [UserImage] Data:", {
        userId: targetUser._id || targetUser.userId,
        userName: targetUser.userName || targetUser.firstName,
        hasColors: !!targetUser.colors,
        colorsLength: targetUser.colors?.length || 0,
        firstColorCode: targetUser.colors?.[0]?.code,
        validColor,
        hasImages: !!targetUser.images,
        imagesLength: targetUser.images?.length || 0,
        hasValidImages,
        firstImagePath,
        allImages: targetUser.images,
      });
    }
    return hasValidImages ? (
      <View>
        <Container
          className={`${p} ${border} ${rounded} ${size} overflow-hidden flex-row items-center box-border justify-center relative ${overflow}`}
          style={{
            borderColor:
              validColor || (isDarkColorScheme ? "#2D2D37" : "#8ecae6"),
            borderWidth: validColor ? borderWidth : 0,
            opacity: show ? 1 : 0,
            backgroundColor: validColor || (isDarkColorScheme ? "#2D2D37" : "#8ecae6"),
          }}
          onPress={onPress}
        >
          <Image
            source={{
              uri: firstImagePath ? (apiUrl + firstImagePath) : "",
            }}
            className={`${size} ${rounded}`}
            style={style ? style : {}}
            resizeMode={resizeMode}
          />
        </Container>

        {showStatus && (
          <View
            className={`absolute bottom-0 right-0 ${statusSize} ${
              targetUser?.status === "online"
                ? "bg-emerald-600"
                : statusColor
                ? statusColor
                : isDarkColorScheme
                ? "bg-slate-300"
                : "bg-slate-500"
            } rounded-full flex items-center justify-center`}
          >
            {showLevel && (
              <Text
                className={`text-base font-bold text-center ${
                  isDarkColorScheme && targetUser?.status !== "online"
                    ? "text-placehoder"
                    : "text-papaya"
                }`}
              >
                {targetUser?.level}
              </Text>
            )}
          </View>
        )}
        {children}
      </View>
    ) : (
      <ImagePlaceholder
        user={targetUser}
        size={size}
        text={text}
        onPress={onPress}
        rounded={rounded}
        border={border}
        show={show}
        p={p}
        overflow={overflow}
        showStatus={showStatus}
        statusSize={statusSize}
        showLevel={showLevel}
        children={children}
        statusColor={statusColor}
      />
    );
  }
);

export default UserImage;
