import React from "react";
import { LinearGradient, Svg, Stop, G, Path } from "react-native-svg";

const LocationIcon = ({
  width = 24,
  height = 24,
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
        id="paint0_linear_733_2895"
        gradientUnits="userSpaceOnUse"
        x1="0"
        x2="24"
        y1="0"
        y2="24"
      >
        <Stop offset="0" stopColor={primaryColor} />
        <Stop offset="0.958333" stopColor={secondaryColor} />
      </LinearGradient>
      <G
        clipRule="evenodd"
        fill="url(#paint0_linear_733_2895)"
        fillRule="evenodd"
      >
        <Path d="m.17507 12.1676c1.18236 6.0828 7.47177 9.978 10.36573 11.4741.924.4777 1.9944.4777 2.9184 0 2.894-1.4961 9.1834-5.3913 10.3657-11.4741.9855-5.06984-2.0871-12.1676-11.8249-12.1676-9.73783 0-12.81039 7.09776-11.82493 12.1676zm1.96225-.3922c.47647 2.4513 2.01209 4.5843 3.92492 6.3495 1.90106 1.7543 4.02616 3.0066 5.38696 3.7101.3534.1827.7482.1827 1.1016 0 1.3608-.7035 3.4859-1.9558 5.387-3.7101 1.9128-1.7652 3.4484-3.8982 3.9249-6.3494.3899-2.00597-.0297-4.43653-1.5029-6.34161-1.4258-1.84385-4.0061-3.40596-8.3598-3.40596-4.35365 0-6.934 1.56211-8.35981 3.40596-1.47316 1.90509-1.89277 4.33564-1.50287 6.34151z" />
        <Path d="m8 10.1396c0 2.24 1.79086 4.0559 4 4.0559 2.2091 0 4-1.8159 4-4.0559 0-2.23999-1.7909-4.05586-4-4.05586-2.20914 0-4 1.81587-4 4.05586zm2 0c0 1.12.8954 2.0279 2 2.0279s2-.9079 2-2.0279c0-1.11999-.8954-2.02793-2-2.02793s-2 .90794-2 2.02793z" />
      </G>
    </Svg>
  );
};

export default LocationIcon;
