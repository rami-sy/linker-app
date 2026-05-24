import { View, Text, TouchableOpacity } from "react-native";
import React from "react";
import { useSelector } from "react-redux";
import FeIcon from "@expo/vector-icons/Feather";
import { useColorScheme } from "~/lib/useColorScheme";

function getBrightness(color) {
  // تحويل اللون من صيغة Hex إلى RGB
  let r = parseInt(color.slice(1, 3), 16);
  let g = parseInt(color.slice(3, 5), 16);
  let b = parseInt(color.slice(5, 7), 16);

  // حساب السطوع
  return (r * 299 + g * 587 + b * 114) / 1000;
}

// دالة لتحديد لون النص بناءً على سطوع اللون
function adjustTextColor(bgColor) {
  let brightness = getBrightness(bgColor);
  // إذا كان السطوع أقل من 128، نختار النص الفاتح (أبيض)، وإذا كان أعلى نختار النص الغامق (أسود)
  return brightness < 128 ? "#dee4e6" : "#2D2D37";
}

// التحقق من أن اللون بصيغة Hex مكون من 6 خانات مثل #A1B2C3
function isValidHex6(color) {
  return typeof color === "string" && /^#([0-9A-Fa-f]{6})$/.test(color.trim());
}
const ImagePlaceholder = ({
  border = "border-4",
  rounded = "rounded-full",
  p = "p-0",
  user,
  size,
  text = "text-lg font-bold",
  onPress,
  show = true,
  overflow = "overflow-auto",
  showStatus = true,
  statusSize = "w-4 h-4",
  showLevel = false,
  isGroup = false,
  children,
  iconSize = 24,
  statusColor = null,
}) => {
  const { user: currentUser } = useSelector((state) => state.users);
  const isCurrentUser = user ? user : currentUser;
  const { isDarkColorScheme } = useColorScheme();
  const Container = onPress ? TouchableOpacity : View;
  // ✅ Extract color from colors array (first color's code)
  const userColor = user?.colors?.length > 0 && user.colors[0]?.code 
    ? user.colors[0].code 
    : null;
  const validColor = isValidHex6(userColor) ? userColor : null;
  return (
    <View>
      <Container
        className={`${p} ${border} ${rounded} ${size} flex-row items-center justify-center relative ${overflow}`}
        style={{
          borderColor: validColor,
          opacity: show ? 1 : 0,
          borderWidth: 0,
          backgroundColor: validColor || (isDarkColorScheme ? "#2D2D37" : "#8ecae6"),
        }}
        onPress={onPress}
      >
        {isGroup ? (
          <FeIcon
            name="users"
            size={iconSize}
            color={isDarkColorScheme ? "#dee4e6" : "#2D2D37"}
          />
        ) : (
          <Text
            className={`${text} text-placehoder dark:text-papaya`}
            style={{
              color: validColor
                ? adjustTextColor(validColor)
                : isDarkColorScheme
                ? "#dee4e6"
                : "#2D2D37",
            }}
          >
            {user?.firstName?.[0].toUpperCase() ||
              user?.email?.[0].toUpperCase() ||
              user?.phoneNumber?.slice(0, 3).toUpperCase() ||
              "U"}
          </Text>
        )}
      </Container>
      {showStatus && !isGroup && (
        <View
          className={`absolute bottom-0 right-0 ${statusSize} ${
            isCurrentUser?.status === "online"
              ? "bg-emerald-600"
              : statusColor
              ? statusColor
              : "bg-slate-500 dark:bg-slate-300"
          } rounded-full flex items-center justify-center`}
        >
          {showLevel && (
            <Text
              className={`text-base font-bold text-center ${
                isCurrentUser?.status !== "online"
                  ? "text-papaya dark:text-placehoder"
                  : "text-papaya"
              }`}
            >
              {isCurrentUser?.level}
            </Text>
          )}
        </View>
      )}
      {children}
    </View>
  );
};

export default ImagePlaceholder;
