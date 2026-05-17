import React from "react";
import { Svg, LinearGradient, Stop, Path } from "react-native-svg";
import { useColorScheme } from "~/lib/useColorScheme";

const SearchActiveIcon = ({ height = 24, width = 24 }) => {
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
        id="paint0_linear_489_2132"
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
        d="m11.3559 22.7118c-8.25884 0-11.3559-2.5809-11.3559-11.3559 0-8.77501 3.09706-11.3559 11.3559-11.3559 8.2588 0 11.3559 2.58089 11.3559 11.3559 0 3.7091-.5533 6.3115-1.8159 8.0801l2.8017 2.8017c.4032.4031.4032 1.0568 0 1.4599-.4031.4032-1.0568.4032-1.46 0l-2.7966-2.7966c-1.8113 1.3101-4.4475 1.8108-8.0851 1.8108z"
        fill="url(#paint0_linear_489_2132)"
      />
    </Svg>
  );
};

export default SearchActiveIcon;
