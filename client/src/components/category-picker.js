import { Text, View, TouchableOpacity } from "react-native";
import React from "react";
import { upperFirst } from "lodash";
import FeIcon from "@expo/vector-icons/Feather";
import { useColorScheme } from "~/lib/useColorScheme";
import { PROFILE_BRAND, getProfileFormChrome } from "./profile-edit/profile-form-theme";

const CategoryPicker = ({
  label,
  items,
  multiple = false, // Indicates if multiple selections are allowed
  error,
  onChange = () => {},
  withLabel = true,
  valueKey = "_id",
  mb = "mb-6",
  clear,
  value,
  onClear,
  containerStyle = "",
  disabled = false, // ✅ New prop for read-only mode
}) => {
  const handleSelectOption = (selectedItem) => {
    onChange(selectedItem);
    // If multiple selections are allowed, toggle the selected item
  };
  const { isDarkColorScheme } = useColorScheme();
  const chrome = getProfileFormChrome(isDarkColorScheme);
  const isSelected = (item) => {
    return multiple
      ? value?.includes(item?.[valueKey] || item)
      : value === (item?.[valueKey] || item);
  };
  return (
    <View className={`flex items-start ${mb} ${containerStyle}`}>
      <View className={`flex-row items-center justify-start`}>
        {clear && value && value.length > 0 && (
          <TouchableOpacity
            className={`flex-row items-center justify-between w-auto`}
            onPress={() => (onClear ? onClear() : onChange([]))}
          >
            <FeIcon
              name="x"
              size={20}
              color={isDarkColorScheme ? "#f56800" : "#ef233c"}
            />
          </TouchableOpacity>
        )}
        {withLabel && error ? (
          <Text
            className="mb-1.5 ml-0 text-sm text-[#ef233c] dark:text-[#f56800]"
          >
            {error}
          </Text>
        ) : (
          withLabel && (
            <Text className="mb-1.5 ml-0 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {label}
            </Text>
          )
        )}
      </View>
      <View className={`flex flex-row flex-wrap gap-2`}>
        {items?.map((item, index) => {
          const active = isSelected(item);
          const idleBg = chrome.fieldBg;
          const idleText = isDarkColorScheme ? "#e2e8f0" : "#334155";
          const activeBg = isDarkColorScheme
            ? "rgba(10, 151, 185, 0.16)"
            : "rgba(10, 151, 185, 0.08)";
          const activeText = isDarkColorScheme ? "#7dd3fc" : PROFILE_BRAND;
          return (
            <TouchableOpacity
              key={item?.[valueKey] || index}
              className={`flex-row items-center px-4 py-2.5 rounded-xl ${disabled ? "opacity-50" : ""}`}
              onPress={() => {
                if (!disabled) {
                  handleSelectOption(item?.[valueKey]);
                }
              }}
              disabled={disabled}
              style={{
                backgroundColor: active ? activeBg : idleBg,
                opacity: disabled ? 0.5 : 1,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: active ? 2 : 0 },
                shadowOpacity: active ? (isDarkColorScheme ? 0.25 : 0.08) : 0,
                shadowRadius: active ? 6 : 0,
                elevation: active ? 3 : 0,
              }}
            >
              <Text
                className="text-[15px] font-semibold"
                style={{
                  color: active ? activeText : idleText,
                }}
              >
                {upperFirst(item?.name || item?.[valueKey] || item)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

export default CategoryPicker;
