import React from "react";
import { Svg, G, LinearGradient, Stop, Path } from "react-native-svg";
import { useColorScheme } from "~/lib/useColorScheme";

const UserActiveIcon = ({ width = 24, height = 24 }) => {
  const { isDarkColorScheme } = useColorScheme();
  const primaryColor = isDarkColorScheme ? "#dee4e6" : "#012a4a";
  const secondaryColor = isDarkColorScheme ? "#dee4e6" : "#012a4a";
  return (
    <Svg
      fill="none"
      height={height}
      viewBox="0 0 22 24"
      width={width}
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
    >
      <LinearGradient
        id="paint0_linear_489_2021"
        gradientUnits="userSpaceOnUse"
        x1="0"
        x2="23.909"
        y1="0"
        y2="21.917"
      >
        <Stop offset="0" stopColor={primaryColor} />
        <Stop offset="0.958333" stopColor={secondaryColor} />
      </LinearGradient>
      <G fill="url(#paint0_linear_489_2021)">
        <Path d="m0 19c0 4.1175 1.9415 5 11 5s11-.8825 11-5-1.9415-5-11-5c-9.0585 0-11 .8825-11 5z" />
        <Path d="m5 6c0 3.31371 2.68629 6 6 6 3.3137 0 6-2.68629 6-6s-2.6863-6-6-6c-3.31371 0-6 2.68629-6 6z" />
      </G>
    </Svg>
  );
};

export default UserActiveIcon;
