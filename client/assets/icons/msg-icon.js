import React from "react";
import { Svg, LinearGradient, Stop, Path, G } from "react-native-svg";
import { useColorScheme } from "~/lib/useColorScheme";
const MsgIcon = ({ width = 24, height = 24 }) => {
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
        id="paint0_linear_733_2655"
        gradientUnits="userSpaceOnUse"
        x1="0"
        x2="24"
        y1="0"
        y2="24"
      >
        <Stop offset="0" stopColor={primaryColor} />
        <Stop offset="0.958333" stopColor={secondaryColor} />
      </LinearGradient>
      <G fill="url(#paint0_linear_733_2655)">
        <Path
          clipRule="evenodd"
          d="m12 0c9.882 0 12 1.77781 12 10.6667 0 5.7778-.9998 9.3333-5.4998 9.3333-2.4048 0-3.1201 1.1424-3.7862 2.2061-.5804.9268-1.1234 1.7939-2.7138 1.7939-1.5902 0-2.13321-.8671-2.71357-1.7939-.66615-1.0637-1.38153-2.2061-3.78639-2.2061-4.5 0-5.50024-3.6693-5.50024-9.3333 0-8.78403 2.118-10.6667 12-10.6667zm10 10.6667c0-4.4987-.5971-6.26759-1.6167-7.16635-.5191-.45756-1.329-.85262-2.7172-1.11969-1.3983-.26903-3.2315-.38066-5.6661-.38066-2.43041 0-4.26117.11788-5.65636.3935-1.38441.27348-2.19743.67556-2.72066 1.14065-1.02899.91466-1.62298 2.69507-1.62298 7.13255 0 2.8107.26607 4.7253.85152 5.8963.26664.5334.57194.8531.91385 1.0566.35.2083.88287.3804 1.73487.3804 1.43732 0 2.6052.3253 3.55557.9692.91442.6196 1.44819 1.4216 1.78899 1.958l.137.216c.2947.4652.3923.6193.5304.7432l.0054.0052c.029.0283.111.1084.4827.1084s.4537-.0801.4827-.1084l.0054-.0052c.1381-.1239.2357-.2779.5304-.7433l.1369-.2158c.3408-.5363.8746-1.3384 1.789-1.958.9503-.644 2.1182-.9693 3.5555-.9693.8626 0 1.4001-.1693 1.7504-.3736.339-.1976.6388-.5065.9012-1.0269.5807-1.1515.8482-3.0587.8482-5.9328z"
          fillRule="evenodd"
        />
        <Path d="m10 7c.5523 0 1 .44771 1 1s-.4477 1-1 1h-3c-.55229 0-1-.44771-1-1s.44771-1 1-1z" />
        <Path d="m17 11c.5523 0 1 .4477 1 1s-.4477 1-1 1h-10c-.55229 0-1-.4477-1-1s.44771-1 1-1z" />
      </G>
    </Svg>
  );
};

export default MsgIcon;
