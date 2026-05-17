import React from "react";
import { LinearGradient, Svg, Stop, G, Path } from "react-native-svg";

const MinimizeIcon = ({
  width = 30,
  height = 30,
  primaryColor = "#dee4e6",
  secondaryColor = "#dee4e6",
}) => {
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
        id="paint0_linear_733_3076"
        gradientUnits="userSpaceOnUse"
        x1="0"
        x2="24"
        y1="0"
        y2="24"
      >
        <Stop offset="0" stopColor={primaryColor} />
        <Stop offset="0.958333" stopColor={secondaryColor} />
      </LinearGradient>
      <G fill="url(#paint0_linear_733_3076)">
        <Path d="m7 12c0-.5523.44772-1 1-1h8c.5523 0 1 .4477 1 1s-.4477 1-1 1h-8c-.55228 0-1-.4477-1-1z" />
        <Path
          clipRule="evenodd"
          d="m0 12c0 9.882 2.118 12 12 12s12-2.118 12-12-2.118-12-12-12-12 2.118-12 12zm2 0c0 2.4249.13254 4.2369.43771 5.6101.30012 1.3504.73997 2.1507 1.27075 2.6814.53078.5308 1.33103.9707 2.68147 1.2708 1.37314.3052 3.18522.4377 5.61007.4377 2.4249 0 4.2369-.1325 5.6101-.4377 1.3504-.3001 2.1507-.74 2.6814-1.2708.5308-.5307.9707-1.331 1.2708-2.6814.3052-1.3732.4377-3.1852.4377-5.6101 0-2.42485-.1325-4.23693-.4377-5.61007-.3001-1.35044-.74-2.15069-1.2708-2.68147-.5307-.53078-1.331-.97063-2.6814-1.27075-1.3732-.30517-3.1852-.43771-5.6101-.43771-2.42485 0-4.23693.13254-5.61007.43771-1.35044.30012-2.15069.73997-2.68147 1.27075s-.97063 1.33103-1.27075 2.68147c-.30517 1.37314-.43771 3.18522-.43771 5.61007z"
          fillRule="evenodd"
        />
      </G>
    </Svg>
  );
};

export default MinimizeIcon;
