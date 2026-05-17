import { TouchableOpacity } from "react-native";
import React from "react";

const Box = ({
  onPress = () => {},
  onLongPress = () => {},
  children,
  w = "w-full",
  justify = "justify-start",
  h = "h-14",
  mb = "mb-1",
  position = "",
  ref,
  disabled = false,
}) => {
  return (
    <TouchableOpacity
      className={`${w} ${h} rounded-2xl ${position} bg-[#f6f8f9] dark:bg-sec ${mb} flex-row items-center ${justify} px-2`}
      onPress={onPress}
      onLongPress={onLongPress}
      ref={ref}
      disabled={disabled}
    >
      {children}
    </TouchableOpacity>
  );
};

export default Box;
