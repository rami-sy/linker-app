import React from "react";
import { LinearGradient, Svg, Stop, G, Path } from "react-native-svg";
import { useColorScheme } from "~/lib/useColorScheme";

const UserIcon = ({ width = 24, height = 24, color = null }) => {
  const { isDarkColorScheme } = useColorScheme();
  const primaryColor = color ? color : isDarkColorScheme ? "#dee4e6" : "#012a4a";
  const secondaryColor = color
    ? color
    : isDarkColorScheme
    ? "#dee4e6"
    : "#012a4a";
  return (
    <Svg
      fill="none"
      height={height}
      viewBox="0 0 22 25"
      width={width}
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
    >
      <LinearGradient
        id="paint0_linear_733_2916"
        gradientUnits="userSpaceOnUse"
        x1="0"
        x2="23.909"
        y1="0.086"
        y2="22.003"
      >
        <Stop offset="0" stopColor={primaryColor} />
        <Stop offset="0.958333" stopColor={secondaryColor} />
      </LinearGradient>
      <G
        clipRule="evenodd"
        fill="url(#paint0_linear_733_2916)"
        fillRule="evenodd"
      >
        <Path d="m0 19.0859c0 4.1175 1.9415 5 11 5s11-.8825 11-5-1.9415-5-11-5c-9.0585 0-11 .8825-11 5zm2 0c0 .9094.11431 1.3795.24164 1.6399.09032.1847.23772.3783.68903.5835.51667.2348 1.35642.4458 2.73004.5845 1.35445.1369 3.09446.1921 5.33929.1921 2.2448 0 3.9848-.0552 5.3393-.1921 1.3736-.1387 2.2134-.3497 2.73-.5845.4513-.2052.5987-.3988.6891-.5835.1273-.2604.2416-.7305.2416-1.6399 0-.9093-.1143-1.3794-.2416-1.6398-.0904-.1847-.2378-.3784-.6891-.5835-.5166-.2348-1.3564-.4458-2.73-.5846-1.3545-.1368-3.0945-.1921-5.3393-.1921-2.24483 0-3.98484.0553-5.33929.1921-1.37362.1388-2.21337.3498-2.73004.5846-.45131.2051-.59871.3988-.68903.5835-.12733.2604-.24164.7305-.24164 1.6398z" />
        <Path d="m5 6.08594c0 3.31371 2.68629 5.99996 6 5.99996 3.3137 0 6-2.68625 6-5.99996s-2.6863-6.0000025-6-6.0000025c-3.31371 0-6 2.6862925-6 6.0000025zm2 0c0 2.20914 1.79086 3.99996 4 3.99996 2.2091 0 4-1.79082 4-3.99996s-1.7909-4-4-4c-2.20914 0-4 1.79086-4 4z" />
      </G>
    </Svg>
  );
};

export default UserIcon;
