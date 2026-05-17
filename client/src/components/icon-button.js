import { TouchableOpacity } from "react-native";
import React from "react";

const IconButton = ({
  onPress,
  iconName,
  iconComponent: Icon,
  size = 25,
  style,
  className,
}) => (
  <TouchableOpacity
    onPress={onPress}
    className={`flex-row items-center justify-center w-10 h-10 bg-black/50 rounded-full ${className}`}
    style={style}
  >
    <Icon name={iconName} size={size} color="#dee4e6" />
  </TouchableOpacity>
);
export default IconButton;
