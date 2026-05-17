import React from "react";
import { View, Text } from "react-native";
import CustomSlider from "@react-native-community/slider";
import { useSelector } from "react-redux";
import { useColorScheme } from "~/lib/useColorScheme";

const Slider = ({
  formData,
  setFormData,
  placeholder,
  name,
  unit = "",
  min = 0,
  max = 100,
  onChange,
  value,
  showValue = true,
  size = "small",
  disabled,
}) => {
  const { isDarkColorScheme } = useColorScheme();
  return (
    <View className={`flex items-start w-full mb-6`}>
      {placeholder && (
        <Text
          className="mb-1 ml-2 text-base text-placehoder dark:text-papaya"
        >
          {placeholder}
        </Text>
      )}
      <View className={`flex items-center justify-center w-full px-3`}>
        <CustomSlider
          style={{ width: "100%", height: 40 }}
          minimumValue={min}
          maximumValue={max}
          value={(value || formData?.[name]) ?? min}
          step={1}
          size={size}
          disabled={disabled}
          minimumTrackTintColor="#0a97b9"
          maximumTrackTintColor="#d3d3d3"
          thumbTintColor="#0a97b9"
          onValueChange={(value) => {
            if (onChange) {
              onChange(value);
            } else {
              setFormData({ ...formData, [name]: value });
            }
          }}
        />
        {showValue && (
          <Text
            className="mt-2 text-base text-placehoder dark:text-papaya"
          >
            {(value || formData?.[name] || min) + " " + unit}
          </Text>
        )}
      </View>
    </View>
  );
};

export default Slider;
