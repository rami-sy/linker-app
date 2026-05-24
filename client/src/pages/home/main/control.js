import { View, Text, TouchableOpacity } from "react-native";
import React from "react";
import MDCIcon from "@expo/vector-icons/MaterialCommunityIcons";
import SIIcon from "@expo/vector-icons/SimpleLineIcons";
import FeIcon from "@expo/vector-icons/Feather";

const Control = ({
  speed,
  energy,
  playerCoords,
  shield,
  playerDistance,
  increaseSpeed,
  decreaseSpeed,
}) => {
  return (
    <>
      <View
        className={`flex flex-row items-center justify-between px-2 mt-4 opacity-60`}
      >
        <View className={`flex flex-row items-center gap-x-1`}>
          <MDCIcon name="speedometer" size={25} color="#6b8087" />

          <Text className={`text-xs text-drakGray`}>
            {parseFloat((speed * 1000).toFixed(2))}
          </Text>
        </View>
        <View className={`flex flex-row items-center gap-x-1`}>
          <SIIcon name="shield" size={25} color="#6b8087" />
          <Text className={`text-xs text-drakGray`}>
            {parseFloat(shield.toFixed(2))}%
          </Text>
        </View>
        <View className={`flex flex-row items-center gap-x-1`}>
          <FeIcon name="sun" size={25} color="#6b8087" />

          <Text className={`text-xs text-drakGray`}>
            {parseFloat(playerDistance.toFixed(0))}
          </Text>
        </View>
        <View className={`flex flex-row items-center gap-x-1`}>
          <SIIcon name="energy" size={25} color="#6b8087" />

          <Text className={`text-xs text-drakGray`}>
            {parseFloat(energy.toFixed(2))}%
          </Text>
        </View>
      </View>
      <View
        className={`flex flex-row items-center justify-between px-2 mt-2 opacity-60`}
      >
        <View className={`flex items-start gap-x-1`}>
          <View className={`flex flex-row items-center gap-x-1`}>
            <FeIcon name="arrow-right" size={25} color="#6b8087" />
            <Text className={`text-xs text-drakGray`}>
              x: {parseFloat(playerCoords.x.toFixed(0))}
            </Text>
          </View>

          <View className={`flex flex-row items-center gap-x-1`}>
            <FeIcon name="arrow-up" size={25} color="#6b8087" />

            <Text className={`text-xs text-drakGray`}>
              y: {parseFloat(playerCoords.y.toFixed(0))}
            </Text>
          </View>

          <View className={`flex flex-row items-center gap-x-1`}>
            <FeIcon name="arrow-up-right" size={25} color="#6b8087" />

            <Text className={`text-xs text-drakGray`}>
              z: {parseFloat(playerCoords.z.toFixed(0))}
            </Text>
          </View>
        </View>
      </View>
      <View
        className={`absolute bottom-0 left-0 right-0 flex flex-row items-center justify-between px-2 mb-8`}
      >
        <TouchableOpacity
          className={`flex flex-row items-center gap-x-1 bg-[# 181c24] rounded-full p-1`}
        >
          <MDCIcon
            name="minus"
            size={40}
            color="#6b8087"
            onPress={decreaseSpeed}
          />
        </TouchableOpacity>
        <TouchableOpacity
          className={`flex flex-row items-center gap-x-1 bg-[# 181c24] rounded-full p-1`}
        >
          <MDCIcon
            name="plus"
            size={40}
            color="#6b8087"
            onPress={increaseSpeed}
          />
        </TouchableOpacity>
      </View>
    </>
  );
};

export default Control;
