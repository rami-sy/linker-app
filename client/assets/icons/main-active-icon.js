import React from "react";
import { Svg, LinearGradient, Stop, Path, G } from "react-native-svg";
import { useColorScheme } from "~/lib/useColorScheme";

const MainActiveIcon = ({ width = 24, height = 24 }) => {
  const { isDarkColorScheme } = useColorScheme();
  const primaryColor = isDarkColorScheme ? "#dee4e6" : "#012a4a";
  const secondaryColor = isDarkColorScheme ? "#dee4e6" : "#012a4a";
  return (
    <Svg
      fill="none"
      height={height}
      viewBox="0 0 24 24"
      width={width}
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
    >
      <LinearGradient
        id="paint0_linear_489_2003"
        gradientUnits="userSpaceOnUse"
        x1="0"
        x2="24"
        y1="0"
        y2="24"
      >
        <Stop offset="0" stopColor={primaryColor} />
        <Stop offset="0.958333" stopColor={secondaryColor} />
      </LinearGradient>
      <G fill="url(#paint0_linear_489_2003)">
        <Path d="m0 5.5c0 4.5293.97075 5.5 5.5 5.5 4.5293 0 5.5-.9707 5.5-5.5 0-4.52925-.9707-5.5-5.5-5.5-4.52925 0-5.5.97075-5.5 5.5z" />
        <Path d="m0 18.5c0 4.5293.97075 5.5 5.5 5.5 4.5293 0 5.5-.9707 5.5-5.5s-.9707-5.5-5.5-5.5c-4.52925 0-5.5.9707-5.5 5.5z" />
        <Path d="m13 5.5c0 4.5293.9707 5.5 5.5 5.5s5.5-.9707 5.5-5.5c0-4.52925-.9707-5.5-5.5-5.5s-5.5.9707-5.5 5.5z" />
        <Path d="m13 18.5c0 4.5293.9707 5.5 5.5 5.5s5.5-.9707 5.5-5.5-.9707-5.5-5.5-5.5-5.5.9707-5.5 5.5z" />
      </G>
    </Svg>
  );
};

export default MainActiveIcon;
