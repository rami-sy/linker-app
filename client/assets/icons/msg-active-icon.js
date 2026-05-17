import React from "react";
import { Svg, LinearGradient, Stop, Path } from "react-native-svg";
import { useColorScheme } from "~/lib/useColorScheme";
const MsgActiveIcon = ({ width = 24, height = 24 }) => {
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
        id="paint0_linear_489_1950"
        gradientUnits="userSpaceOnUse"
        x1="0"
        x2="24"
        y1="0"
        y2="24"
      >
        <Stop offset="0" stopColor={primaryColor} />
        <Stop offset="0.958333" stopColor={secondaryColor} />
      </LinearGradient>
      <Path
        clipRule="evenodd"
        d="m12 0c9.882 0 12 1.77781 12 10.6667 0 5.7778-.9998 9.3333-5.4998 9.3333-2.4048 0-3.1201 1.1424-3.7862 2.2061-.5804.9268-1.1234 1.7939-2.7138 1.7939-1.5902 0-2.13321-.8671-2.71357-1.7939-.66615-1.0637-1.38153-2.2061-3.78639-2.2061-4.5 0-5.50024-3.6693-5.50024-9.3333 0-8.78403 2.118-10.6667 12-10.6667zm-1 8c0-.55228-.4477-1-1-1h-3c-.55228 0-1 .44772-1 1s.44772 1 1 1h3c.5523 0 1-.44772 1-1zm6 3c.5523 0 1 .4477 1 1s-.4477 1-1 1h-10c-.55228 0-1-.4477-1-1s.44771-1 1-1z"
        fill="url(#paint0_linear_489_1950)"
        fillRule="evenodd"
      />
    </Svg>
  );
};

export default MsgActiveIcon;
