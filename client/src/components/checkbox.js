import { View, Text, Switch } from "react-native";
import React from "react";
import { useColorScheme } from "~/lib/useColorScheme";

const Checkbox = ({
  formData,
  setFormData,
  name,
  placeholder,
  mb = "mb-6",
  px = "px-3",
  py = "py-3",
  error,
  onChange,
  checked,
  value,
  w = "w-auto",
}) => {
  const handleChange = (newValue) => {
    if (onChange) {
      onChange(newValue);
    } else {
      if (!name) {
        setFormData(newValue);
      } else {
        setFormData({ ...formData, [name]: newValue });
      }
    }
  };
  const { isDarkColorScheme } = useColorScheme();
  return (
    <View
      className={`flex-row items-center justify-between ${w} ${mb} bg-[#f6f8f9] dark:bg-sec ${px} ${py} rounded-2xl border-stone-300 dark:border-stone-800`}
    >
      {error ? (
        <Text className="mb-1 mx-2 text-base text-[#ef233c] dark:text-[#f56800]">
          {error}
        </Text>
      ) : (
        <Text className="mb-1 mx-2 text-base text-placehoder dark:text-papaya">
          {placeholder}
        </Text>
      )}
      <Switch
        value={checked || value || formData?.[name]}
        onValueChange={handleChange}
      />
    </View>
  );
};

export default Checkbox;
