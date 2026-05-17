import { Text } from "react-native";
import React from "react";
import { useSelector } from "react-redux";
import getFullName from "../utils/getFullName";
import { useColorScheme } from "~/lib/useColorScheme";

const UserName = ({
  user = null,
  onPress,
  onlyFirst = false,
  style,
  className = "text-base text-center",
  maxLength = 12,
}) => {
  const { user: currentUser } = useSelector((state) => state.users);
  const displayUser = user || currentUser; // Use provided user or current user from state

  const fullName = getFullName(displayUser, onlyFirst, maxLength);
  const { isDarkColorScheme } = useColorScheme();

  return (
    <Text
      onPress={onPress}
      className={`text-slate-600 dark:text-slate-300 ${className}`}
      style={style}
    >
      {fullName}
    </Text>
  );
};

export default UserName;
