import { View, Text, Animated } from "react-native";
import React from "react";
import WhiteLogo from "../../assets/white-logo.svg";
import DarkLogo from "../../assets/dark-logo.svg";
import WhiteLogoText from "../../assets/white-linker.svg";
import DarkLogoText from "../../assets/dark-linker.svg";
import { useColorScheme } from "~/lib/useColorScheme";
const Logo = ({
  width = 154,
  height = 86,
  withText = true,
  my = "mb-3 mt-9",
}) => {
  const { isDarkColorScheme } = useColorScheme();
  return (
    <View className={`items-center justify-center w-9/12 ${my}`}>
      {isDarkColorScheme ? (
        <WhiteLogo width={width} height={height} />
      ) : (
        <DarkLogo width={width} height={height} />
      )}
      {withText && (
        <View className={`mt-1`}>
          {isDarkColorScheme ? <WhiteLogoText /> : <DarkLogoText />}
        </View>
      )}
    </View>
  );
};

export default Logo;
