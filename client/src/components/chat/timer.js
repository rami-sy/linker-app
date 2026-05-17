import React, { useEffect } from "react";
import { View, Text } from "react-native";
import { useStopwatch } from "react-timer-hook";

const Timer = React.memo(
  ({ callStatus, className = "absolute z-10 top-3 left-1" }) => {
    const { seconds, minutes, hours, isRunning, start, pause, reset } =
      useStopwatch({ autoStart: false });

    useEffect(() => {
      if (callStatus === "connected") {
        start();
      } else {
        reset();
      }

      return () => {
        reset();
      };
    }, [callStatus]);
    return (
      <View className={`${className}`}>
        <Text className="p-1 px-2 text-base rounded-full text-slate-300 bg-emerald-700/90">
          {`${hours > 0 ? `${hours}:` : ""}${minutes}:${
            seconds < 10 ? "0" : ""
          }${seconds}`}
        </Text>
      </View>
    );
  }
);

export default Timer;
