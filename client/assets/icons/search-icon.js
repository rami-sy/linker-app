import React from "react";
import { Svg, LinearGradient, Stop, Path, G } from "react-native-svg";
import { useColorScheme } from "~/lib/useColorScheme";

const SearchIcon = ({ height = 24, width = 24, color = null }) => {
  const { isDarkColorScheme } = useColorScheme();

  const primaryColor = color || (isDarkColorScheme ? "#dee4e6" : "#012a4a");
  const secondaryColor = color || (isDarkColorScheme ? "#dee4e6" : "#012a4a");

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
        id="paint0_linear_733_2529"
        gradientUnits="userSpaceOnUse"
        x1="0"
        x2="23.58"
        y1="0"
        y2="23.58"
      >
        <Stop offset="0" stopColor={primaryColor} />
        <Stop offset="0.958333" stopColor={secondaryColor} />
      </LinearGradient>
      <G fill="url(#paint0_linear_733_2529)">
        <Path d="m19.6915 18.2571-1.4344 1.4344 3.5913 3.5913c.3961.3961 1.0383.3961 1.4344 0s.3961-1.0383 0-1.4344z" />
        <Path
          clipRule="evenodd"
          d="m0 11c0 8.5 3 11 11 11s11-2.5 11-11-3-11-11-11-11 2.5-11 11zm2 0c0 4.1211.75081 6.151 1.88827 7.2478 1.15467 1.1134 3.20345 1.7522 7.11173 1.7522 3.9083 0 5.9571-.6388 7.1117-1.7522 1.1375-1.0968 1.8883-3.1267 1.8883-7.2478 0-4.12115-.7508-6.15098-1.8883-7.24781-1.1546-1.11343-3.2034-1.75219-7.1117-1.75219-3.90828 0-5.95706.63876-7.11173 1.75219-1.13746 1.09683-1.88827 3.12666-1.88827 7.24781z"
          fillRule="evenodd"
        />
      </G>
    </Svg>
  );
};

export default SearchIcon;
