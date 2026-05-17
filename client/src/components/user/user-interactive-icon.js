import { View, Text } from "react-native";
import React from "react";
import UserIcon from "../../../assets/icons/user-icon";
import MCIcon from "react-native-vector-icons/MaterialCommunityIcons";
import { useColorScheme } from "../../../lib/useColorScheme";

const UserInteractiveIcon = ({
  iconSize = 25,
  iconName = "plus",
  iconSecondarySize = 20,
  containerClassName = "",
  color = null,
  iconClassName = "",
}) => {
  const { isDarkColorScheme } = useColorScheme();
  return (
    <View
      className={`flex-row items-center justify-center relative ${containerClassName}`}
    >
      <UserIcon
        width={iconSize}
        height={iconSize}
        color={color ? color : isDarkColorScheme ? "#dee4e6" : "#012a4a"}
      />
      {iconSecondarySize && (
        <MCIcon
          name={iconName}
          size={iconSecondarySize}
          color={color ? color : isDarkColorScheme ? "#dee4e6" : "#012a4a"}
          className={`absolute -top-1 -right-3 ${iconClassName}`}
        />
      )}
    </View>
  );
};

export default UserInteractiveIcon;
